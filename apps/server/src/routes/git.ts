import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { applications, deployments } from "@nocap/db";
import { githubManifestSchema, gitlabInputSchema, settingsUpdateSchema } from "@nocap/shared";
import type { AppContext } from "../app";
import { audit } from "../audit";
import { safeEqual, validGithubSignature } from "../git";
import { HttpError, parseBody, requireAuth } from "../http";

type IdParams = { Params: { id: string } };

export async function gitRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, git, deployer } = ctx;

  /** Queues a deployment unless one is already waiting or running. Returns its id, or null. */
  async function deployIfIdle(applicationId: string, trigger: string): Promise<string | null> {
    const [active] = await db
      .select({ id: deployments.id })
      .from(deployments)
      .where(
        and(
          eq(deployments.applicationId, applicationId),
          inArray(deployments.status, ["queued", "building"]),
        ),
      );
    if (active) return null;
    return deployer.enqueue(applicationId, trigger);
  }

  /** Apps that follow this repository and branch and deploy on push. */
  async function appsFor(providerId: string, fullName: string, branch: string) {
    return db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.gitProviderId, providerId),
          sql`lower(${applications.repoFullName}) = ${fullName.toLowerCase()}`,
          eq(applications.branch, branch),
          eq(applications.autoDeploy, true),
        ),
      );
  }

  // ---------------------------------------------------------------- settings

  app.get("/api/settings", { preHandler: requireAuth }, async () => ({
    settings: await git.panelSettings(),
  }));

  app.patch("/api/settings", { preHandler: requireAuth }, async (request, reply) => {
    const input = parseBody(settingsUpdateSchema, request, reply);
    if (!input) return;
    await git.setPanelUrl(input.panelUrl);
    await audit(db, { action: "settings.updated", userId: request.user?.id, ip: request.ip });
    return { settings: await git.panelSettings() };
  });

  // ---------------------------------------------------------------- accounts

  app.get("/api/git-providers", { preHandler: requireAuth }, async () => ({
    providers: await git.list(),
  }));

  app.post(
    "/api/git-providers/github/manifest",
    { preHandler: requireAuth },
    async (request, reply) => {
      const input = parseBody(githubManifestSchema, request, reply);
      if (!input) return;
      return git.githubManifest(input.panelUrl, input.organization || undefined);
    },
  );

  // GitHub sends the browser here after the app is created, then after it is installed.
  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/api/git-providers/github/callback",
    async (request, reply) => {
      if (!request.user) return reply.redirect("/login");
      try {
        const created = await git.githubFinish(request.query.code ?? "", request.query.state ?? "");
        await audit(db, {
          action: "git_provider.created",
          userId: request.user.id,
          targetType: "git_provider",
          targetId: created.id,
          ip: request.ip,
        });
        // Straight on to choosing which repositories the app can read.
        return reply.redirect(created.installUrl);
      } catch (err) {
        const message = err instanceof HttpError ? err.message : "GitHub setup failed";
        return reply.redirect(`/git?error=${encodeURIComponent(message)}`);
      }
    },
  );

  app.get("/api/git-providers/github/setup", async (request, reply) => {
    if (!request.user) return reply.redirect("/login");
    return reply.redirect("/git?installed=1");
  });

  app.post("/api/git-providers/gitlab", { preHandler: requireAuth }, async (request, reply) => {
    const input = parseBody(gitlabInputSchema, request, reply);
    if (!input) return;
    const provider = await git.addGitlab(input);
    await audit(db, {
      action: "git_provider.created",
      userId: request.user?.id,
      targetType: "git_provider",
      targetId: provider.id,
      ip: request.ip,
    });
    return reply.code(201).send({ provider });
  });

  app.get<IdParams & { Querystring: { search?: string } }>(
    "/api/git-providers/:id/repos",
    { preHandler: requireAuth },
    async (request) => ({ repos: await git.repos(request.params.id, request.query.search ?? "") }),
  );

  app.get<IdParams & { Querystring: { repo?: string } }>(
    "/api/git-providers/:id/branches",
    { preHandler: requireAuth },
    async (request) => ({
      branches: await git.branches(request.params.id, request.query.repo ?? ""),
    }),
  );

  app.delete<IdParams>(
    "/api/git-providers/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      await git.remove(request.params.id);
      await audit(db, {
        action: "git_provider.deleted",
        userId: request.user?.id,
        targetType: "git_provider",
        targetId: request.params.id,
        ip: request.ip,
      });
      return reply.code(204).send();
    },
  );

  app.post<IdParams>(
    "/api/applications/:id/deploy-token",
    { preHandler: requireAuth },
    async (request) => {
      const token = randomBytes(24).toString("hex");
      const [row] = await db
        .update(applications)
        .set({ deployToken: token })
        .where(eq(applications.id, request.params.id))
        .returning({ id: applications.id });
      if (!row) throw new HttpError(404, "Application not found");
      await audit(db, {
        action: "application.deploy_token_reset",
        userId: request.user?.id,
        targetType: "application",
        targetId: row.id,
        ip: request.ip,
      });
      return { deployToken: token };
    },
  );

  // ---------------------------------------------------------------- webhooks
  // These come from GitHub, GitLab or a CI job, not from the panel: no session, but every one is
  // checked against a secret. JSON bodies are kept raw so GitHub's signature can be verified.

  await app.register(async (hooks) => {
    hooks.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    const rawJson = (body: unknown): Record<string, unknown> => {
      try {
        return JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : "{}") as Record<
          string,
          unknown
        >;
      } catch {
        return {};
      }
    };

    hooks.post<IdParams>(
      "/api/webhooks/github/:id",
      { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
      async (request, reply) => {
        const secret = await git.webhookSecret(request.params.id, "github");
        const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        const signature = request.headers["x-hub-signature-256"];
        if (
          !secret ||
          !validGithubSignature(secret, raw, typeof signature === "string" ? signature : undefined)
        ) {
          return reply.code(401).send({ error: "Invalid signature" });
        }
        const event = request.headers["x-github-event"];
        if (event !== "push") return { ok: true, ignored: event };
        const payload = rawJson(raw) as {
          ref?: string;
          deleted?: boolean;
          repository?: { full_name?: string };
        };
        if (
          payload.deleted ||
          !payload.ref?.startsWith("refs/heads/") ||
          !payload.repository?.full_name
        ) {
          return { ok: true, queued: 0 };
        }
        const branch = payload.ref.slice("refs/heads/".length);
        const targets = await appsFor(request.params.id, payload.repository.full_name, branch);
        let queued = 0;
        for (const target of targets) if (await deployIfIdle(target.id, "push")) queued += 1;
        return reply.code(202).send({ ok: true, queued });
      },
    );

    hooks.post<IdParams>(
      "/api/webhooks/gitlab/:id",
      { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
      async (request, reply) => {
        const secret = await git.webhookSecret(request.params.id, "gitlab");
        const token = request.headers["x-gitlab-token"];
        if (!secret || typeof token !== "string" || !safeEqual(secret, token)) {
          return reply.code(401).send({ error: "Invalid token" });
        }
        const payload = rawJson(request.body) as {
          object_kind?: string;
          ref?: string;
          after?: string;
          project?: { path_with_namespace?: string };
        };
        if (payload.object_kind !== "push" || !payload.ref?.startsWith("refs/heads/")) {
          return { ok: true, queued: 0 };
        }
        if (/^0+$/.test(payload.after ?? "")) return { ok: true, queued: 0 }; // branch deleted
        const fullName = payload.project?.path_with_namespace ?? "";
        const branch = payload.ref.slice("refs/heads/".length);
        let queued = 0;
        for (const target of await appsFor(request.params.id, fullName, branch)) {
          if (await deployIfIdle(target.id, "push")) queued += 1;
        }
        return reply.code(202).send({ ok: true, queued });
      },
    );

    // Deploy hook: POST this URL from any CI (Bitbucket, Gitea, a cron job) to deploy the app.
    hooks.post<{ Params: { token: string } }>(
      "/api/hooks/deploy/:token",
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      async (request, reply) => {
        const token = request.params.token;
        if (!/^[a-f0-9]{32,128}$/.test(token)) return reply.code(404).send({ error: "Not found" });
        const [target] = await db
          .select({ id: applications.id })
          .from(applications)
          .where(eq(applications.deployToken, token));
        if (!target) return reply.code(404).send({ error: "Not found" });
        const id = await deployIfIdle(target.id, "hook");
        if (!id) return reply.code(409).send({ error: "A deployment is already in progress" });
        return reply.code(202).send({ ok: true, deployment: id });
      },
    );
  });
}
