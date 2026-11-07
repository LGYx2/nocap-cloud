import { existsSync } from "node:fs";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Database } from "@nocap/db";
import type { ApiError, HealthResponse, PublicUser } from "@nocap/shared";
import { findSessionUser, SESSION_COOKIE } from "./auth/sessions";
import type { Config } from "./config";
import { DatabaseService } from "./databases";
import { Deployer } from "./deployer";
import { GitService } from "./git";
import { applicationRoutes } from "./routes/applications";
import { authRoutes } from "./routes/auth";
import { databaseRoutes } from "./routes/databases";
import { gitRoutes } from "./routes/git";
import { overviewRoutes } from "./routes/overview";
import { projectRoutes } from "./routes/projects";
import { DockerCliRuntime, type Runtime } from "./runtime";

declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
  }
  interface FastifyInstance {
    deployer: Deployer;
    databases: DatabaseService;
  }
}

export interface AppContext {
  db: Database;
  config: Config;
  runtime: Runtime;
  deployer: Deployer;
  git: GitService;
  databases: DatabaseService;
}

/** What buildApp needs; the runtime and deployer are created when not given (tests pass fakes). */
export interface AppOptions {
  db: Database;
  config: Config;
  runtime?: Runtime;
  deployer?: Deployer;
  git?: GitService;
  databases?: DatabaseService;
}

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; " +
    // GitHub: the panel posts the app manifest to github.com to create the GitHub App.
    "form-action 'self' https://github.com",
};

export async function buildApp(
  options: AppOptions,
  logger: FastifyServerOptions["logger"] = false,
): Promise<FastifyInstance> {
  const { db, config } = options;

  const app = Fastify({
    logger,
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  const runtime = options.runtime ?? new DockerCliRuntime();
  const git = options.git ?? new GitService(db, config);
  const databases = options.databases ?? new DatabaseService({ db, config, runtime, log: app.log });
  const deployer =
    options.deployer ?? new Deployer({ db, config, runtime, git, databases, log: app.log });
  const ctx: AppContext = { db, config, runtime, deployer, git, databases };
  app.decorate("deployer", deployer);
  app.decorate("databases", databases);

  app.decorateRequest("user", null);

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too many attempts. Wait a minute and try again.",
    }),
  });

  app.addHook("onSend", async (_request, reply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
  });

  // Load the signed-in user for API calls only; static files do not need the database.
  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/api/")) return;
    const token = request.cookies[SESSION_COOKIE];
    if (token) request.user = await findSessionUser(db, token);
  });

  app.setErrorHandler((error: Error & { statusCode?: number; error?: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "request failed");
      const body: ApiError = { error: "Something went wrong. Check the server logs." };
      return reply.code(500).send(body);
    }
    const body: ApiError = { error: error.error ?? error.message };
    return reply.code(status).send(body);
  });

  app.get("/api/health", async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
    } catch {
      return reply.code(503).send({ error: "Database is not reachable" } satisfies ApiError);
    }
    return { status: "ok", version: config.NOCAP_VERSION } satisfies HealthResponse;
  });

  await authRoutes(app, ctx);
  await projectRoutes(app, ctx);
  await applicationRoutes(app, ctx);
  await overviewRoutes(app, ctx);
  await gitRoutes(app, ctx);
  await databaseRoutes(app, ctx);

  const publicDir = config.PUBLIC_DIR;
  const servePanel = publicDir !== undefined && existsSync(join(publicDir, "index.html"));
  if (servePanel) {
    await app.register(fastifyStatic, {
      root: publicDir,
      wildcard: false,
      // We set cache-control ourselves below; the plugin default would overwrite it.
      cacheControl: false,
      setHeaders: (res, path) => {
        // Vite puts hashed files in /assets, so they can be cached forever.
        // Normalise separators so this also works on Windows during development.
        const immutable = path.replaceAll("\\", "/").includes("/assets/");
        res.setHeader(
          "cache-control",
          immutable ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    // Unknown API routes and missing build files are 404s; every other GET is a panel page
    // handled by client-side routing.
    const isFile = request.url.startsWith("/assets/") || /\.[a-z0-9]+(\?.*)?$/i.test(request.url);
    if (request.url.startsWith("/api/") || isFile || !servePanel || request.method !== "GET") {
      return reply.code(404).send({ error: "Not found" } satisfies ApiError);
    }
    // cacheControl: false stops @fastify/static from replacing our header with max-age=0,
    // so browsers always check for a new panel after an update.
    return reply
      .header("cache-control", "no-cache")
      .sendFile("index.html", { cacheControl: false });
  });

  return app;
}
