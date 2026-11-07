import { open } from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  applications,
  databaseLinks,
  databases,
  deployments,
  domains,
  envVars,
  projects,
} from "@nocap/db";
import {
  applicationInputSchema,
  applicationUpdateSchema,
  domainInputSchema,
  envVarsSchema,
  type AppAction,
  type DeploymentLog,
  type Domain,
  type LinkedVariable,
} from "@nocap/shared";
import type { AppContext } from "../app";
import { audit } from "../audit";
import { secretBox } from "../crypto";
import { repoFullName } from "../git";
import { HttpError, parseBody, requireAuth } from "../http";
import {
  findApplication,
  findDeployment,
  loadApplications,
  selectDeployments,
  toDeployment,
  UUID,
} from "../views";

const LOG_CHUNK = 256 * 1024;
const ACTIONS: AppAction[] = ["start", "stop", "restart"];

type IdParams = { Params: { id: string } };

export async function applicationRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, config, runtime, deployer, git } = ctx;

  const record = (
    request: FastifyRequest,
    action: string,
    targetId: string,
    metadata?: Record<string, unknown>,
  ) =>
    audit(
      db,
      {
        action,
        userId: request.user?.id,
        targetType: action.split(".")[0],
        targetId,
        metadata,
        ip: request.ip,
      },
      request.log,
    );

  /** Variables the app gets from linked databases (names only, never the URL). */
  async function linkedVariables(applicationId: string): Promise<LinkedVariable[]> {
    return db
      .select({
        linkId: databaseLinks.id,
        variable: databaseLinks.variable,
        databaseId: databases.id,
        databaseName: databases.name,
        engine: databases.engine,
      })
      .from(databaseLinks)
      .innerJoin(databases, eq(databases.id, databaseLinks.databaseId))
      .where(eq(databaseLinks.applicationId, applicationId))
      .orderBy(databaseLinks.variable);
  }

  async function projectExists(id: string) {
    if (!UUID.test(id)) throw new HttpError(404, "Project not found");
    const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id));
    if (!row) throw new HttpError(404, "Project not found");
  }

  // ---------------------------------------------------------------- applications

  app.get<IdParams>(
    "/api/projects/:id/applications",
    { preHandler: requireAuth },
    async (request) => {
      await projectExists(request.params.id);
      return { applications: await loadApplications(db, { projectId: request.params.id }) };
    },
  );

  app.get("/api/applications", { preHandler: requireAuth }, async () => ({
    applications: await loadApplications(db, {}),
  }));

  app.post<IdParams>(
    "/api/projects/:id/applications",
    { preHandler: requireAuth },
    async (request, reply) => {
      const input = parseBody(applicationInputSchema, request, reply);
      if (!input) return;
      await projectExists(request.params.id);
      if (input.source === "git" && input.gitProviderId) await git.get(input.gitProviderId);
      const [created] = await db
        .insert(applications)
        .values(
          input.source === "git"
            ? {
                projectId: request.params.id,
                name: input.name,
                buildType: "dockerfile",
                repoUrl: input.repoUrl,
                repoFullName: repoFullName(input.repoUrl),
                gitProviderId: input.gitProviderId ?? null,
                autoDeploy: input.autoDeploy,
                branch: input.branch,
                dockerfilePath: input.dockerfilePath,
                port: input.port,
              }
            : {
                projectId: request.params.id,
                name: input.name,
                buildType: "image",
                image: input.image,
                port: input.port,
              },
        )
        .returning({ id: applications.id });
      if (!created) throw new Error("Application was not created");
      await record(request, "application.created", created.id, { source: input.source });
      // GitLab needs a webhook per project; GitHub sends pushes through the app's own webhook.
      if (input.source === "git" && input.gitProviderId && input.autoDeploy) {
        const provider = await git.get(input.gitProviderId);
        if (provider.type === "gitlab") {
          await git.gitlabAddHook(provider.id, repoFullName(input.repoUrl));
        }
      }
      return reply.code(201).send({ application: await findApplication(db, created.id) });
    },
  );

  app.get<IdParams>("/api/applications/:id", { preHandler: requireAuth }, async (request) => ({
    application: await findApplication(db, request.params.id),
  }));

  app.patch<IdParams>(
    "/api/applications/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const input = parseBody(applicationUpdateSchema, request, reply);
      if (!input) return;
      const current = await findApplication(db, request.params.id);
      const changes: Record<string, unknown> = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      );
      if (input.repoUrl) changes.repoFullName = repoFullName(input.repoUrl);
      if (Object.keys(changes).length > 0) {
        await db.update(applications).set(changes).where(eq(applications.id, current.id));
        await record(request, "application.updated", current.id, { fields: Object.keys(changes) });
      }
      return { application: await findApplication(db, current.id) };
    },
  );

  app.delete<IdParams>(
    "/api/applications/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const current = await findApplication(db, request.params.id);
      if (current.status === "building") {
        throw new HttpError(409, "Wait for the deployment to finish before deleting the app.");
      }
      const containers = await runtime.containers(current.id).catch(() => []);
      for (const container of containers) await runtime.remove(container.id).catch(() => undefined);
      await db.delete(applications).where(eq(applications.id, current.id));
      await record(request, "application.deleted", current.id, { name: current.name });
      return reply.code(204).send();
    },
  );

  // ---------------------------------------------------------------- deployments

  app.post<IdParams>(
    "/api/applications/:id/deploy",
    { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const current = await findApplication(db, request.params.id);
      const [active] = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(
          and(
            eq(deployments.applicationId, current.id),
            inArray(deployments.status, ["queued", "building"]),
          ),
        );
      if (active) throw new HttpError(409, "A deployment of this app is already in progress.");
      const id = await deployer.enqueue(current.id, current.lastDeployment ? "redeploy" : "manual");
      await record(request, "deployment.created", id, { application: current.id });
      return reply.code(202).send({ deployment: await findDeployment(db, id) });
    },
  );

  app.get<IdParams & { Querystring: { limit?: string } }>(
    "/api/applications/:id/deployments",
    { preHandler: requireAuth },
    async (request) => {
      const current = await findApplication(db, request.params.id);
      const rows = await selectDeployments(db)
        .where(eq(deployments.applicationId, current.id))
        .limit(50);
      return { deployments: rows.map(toDeployment) };
    },
  );

  app.get<{ Querystring: { limit?: string } }>(
    "/api/deployments",
    { preHandler: requireAuth },
    async (request) => {
      const limit = Math.min(Math.max(Number(request.query.limit) || 30, 1), 100);
      const rows = await selectDeployments(db).limit(limit);
      return { deployments: rows.map(toDeployment) };
    },
  );

  app.get<IdParams>("/api/deployments/:id", { preHandler: requireAuth }, async (request) => ({
    deployment: await findDeployment(db, request.params.id),
  }));

  app.get<IdParams & { Querystring: { offset?: string } }>(
    "/api/deployments/:id/logs",
    { preHandler: requireAuth },
    async (request): Promise<DeploymentLog> => {
      const deployment = await findDeployment(db, request.params.id);
      const offset = Math.max(Number(request.query.offset) || 0, 0);
      const done = !["queued", "building"].includes(deployment.status);
      let handle;
      try {
        handle = await open(deployer.logPath(deployment.id), "r");
      } catch {
        return { text: "", next: offset, done };
      }
      try {
        const buffer = Buffer.alloc(LOG_CHUNK);
        const { bytesRead } = await handle.read(buffer, 0, LOG_CHUNK, offset);
        // Stop at the last full line, so a multi-byte character is never cut in half.
        let end = bytesRead;
        if (bytesRead === LOG_CHUNK) end = buffer.lastIndexOf(10, bytesRead - 1) + 1 || bytesRead;
        const more = bytesRead === LOG_CHUNK;
        return {
          text: buffer.subarray(0, end).toString("utf8"),
          next: offset + end,
          done: done && !more,
        };
      } finally {
        await handle.close();
      }
    },
  );

  // ---------------------------------------------------------------- running app

  app.post<{ Params: { id: string; action: string } }>(
    "/api/applications/:id/actions/:action",
    { preHandler: requireAuth },
    async (request) => {
      const action = request.params.action as AppAction;
      if (!ACTIONS.includes(action)) throw new HttpError(404, "Unknown action");
      const current = await findApplication(db, request.params.id);
      const containers = await runtime.containers(current.id).catch(() => {
        throw new HttpError(503, "Docker is not reachable on this server.");
      });
      if (containers.length === 0) throw new HttpError(409, "Deploy the app first.");
      for (const container of containers) await runtime.action(container.id, action);
      await db
        .update(applications)
        .set({ status: action === "stop" ? "stopped" : "running" })
        .where(eq(applications.id, current.id));
      await record(request, `application.${action}`, current.id);
      return { application: await findApplication(db, current.id) };
    },
  );

  app.get<IdParams & { Querystring: { tail?: string } }>(
    "/api/applications/:id/logs",
    { preHandler: requireAuth },
    async (request) => {
      const current = await findApplication(db, request.params.id);
      const tail = Math.min(Math.max(Number(request.query.tail) || 200, 10), 2000);
      const containers = await runtime.containers(current.id).catch(() => []);
      const live = containers.find((c) => c.running) ?? containers[0];
      if (!live) return { logs: "", running: false };
      return { logs: await runtime.logs(live.id, tail).catch(() => ""), running: live.running };
    },
  );

  // ---------------------------------------------------------------- domains

  app.get<IdParams>(
    "/api/applications/:id/domains",
    { preHandler: requireAuth },
    async (request) => {
      const current = await findApplication(db, request.params.id);
      const rows = await db
        .select()
        .from(domains)
        .where(eq(domains.applicationId, current.id))
        .orderBy(domains.createdAt);
      return { domains: rows.map(toDomain) };
    },
  );

  app.post<IdParams>(
    "/api/applications/:id/domains",
    { preHandler: requireAuth },
    async (request, reply) => {
      const input = parseBody(domainInputSchema, request, reply);
      if (!input) return;
      const current = await findApplication(db, request.params.id);
      const [taken] = await db
        .select({ id: domains.id })
        .from(domains)
        .where(eq(domains.hostname, input.hostname));
      if (taken) {
        return reply.code(400).send({
          error: "Check the highlighted fields",
          fields: { hostname: "This domain is already used by an app" },
        });
      }
      const [row] = await db
        .insert(domains)
        .values({ applicationId: current.id, hostname: input.hostname })
        .returning();
      if (!row) throw new Error("Domain was not created");
      await record(request, "domain.created", row.id, { hostname: row.hostname });
      return reply.code(201).send({ domain: toDomain(row) });
    },
  );

  app.delete<IdParams>("/api/domains/:id", { preHandler: requireAuth }, async (request, reply) => {
    if (!UUID.test(request.params.id)) throw new HttpError(404, "Domain not found");
    const [row] = await db.delete(domains).where(eq(domains.id, request.params.id)).returning();
    if (!row) throw new HttpError(404, "Domain not found");
    await record(request, "domain.deleted", row.id, { hostname: row.hostname });
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------- environment

  app.get<IdParams>("/api/applications/:id/env", { preHandler: requireAuth }, async (request) => {
    const current = await findApplication(db, request.params.id);
    const rows = await db
      .select()
      .from(envVars)
      .where(eq(envVars.applicationId, current.id))
      .orderBy(envVars.key);
    const linked = await linkedVariables(current.id);
    if (rows.length === 0) return { vars: [], linked };
    const box = secretBox(config.NOCAP_SECRET);
    return {
      vars: rows.map((row) => ({ key: row.key, value: box.open(row.valueEnc) })),
      linked,
    };
  });

  app.put<IdParams>(
    "/api/applications/:id/env",
    { preHandler: requireAuth },
    async (request, reply) => {
      const input = parseBody(envVarsSchema, request, reply);
      if (!input) return;
      const current = await findApplication(db, request.params.id);
      const linked = new Set((await linkedVariables(current.id)).map((link) => link.variable));
      const clash = input.vars.find((v) => linked.has(v.key));
      if (clash) {
        return reply.code(400).send({
          error: `${clash.key} comes from a linked database. Unlink it first or use another name.`,
        });
      }
      const box = secretBox(config.NOCAP_SECRET);
      await db.transaction(async (tx) => {
        await tx.delete(envVars).where(eq(envVars.applicationId, current.id));
        if (input.vars.length > 0) {
          await tx.insert(envVars).values(
            input.vars.map((v) => ({
              applicationId: current.id,
              key: v.key,
              valueEnc: box.seal(v.value),
            })),
          );
        }
      });
      await record(request, "env.updated", current.id, { keys: input.vars.map((v) => v.key) });
      return { vars: input.vars };
    },
  );
}

function toDomain(row: typeof domains.$inferSelect): Domain {
  return {
    id: row.id,
    applicationId: row.applicationId,
    hostname: row.hostname,
    https: row.https,
    createdAt: row.createdAt.toISOString(),
  };
}
