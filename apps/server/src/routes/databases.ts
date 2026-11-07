import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { applications, databaseLinks, databases, envVars, projects } from "@nocap/db";
import {
  DATABASE_ENGINES,
  databaseInputSchema,
  databaseLinkSchema,
  type ContainerUsage,
  type DatabaseAction,
  type DatabaseConnection,
} from "@nocap/shared";
import type { AppContext } from "../app";
import { audit } from "../audit";
import { secretBox } from "../crypto";
import { databaseRow, findDatabase, loadDatabases } from "../databases";
import { connectionUrl, ENGINE_SPECS, generatePassword } from "../engines";
import { HttpError, parseBody, requireAuth } from "../http";
import { short } from "../runtime";
import { UUID } from "../views";

const ACTIONS: DatabaseAction[] = ["start", "stop", "restart"];

type IdParams = { Params: { id: string } };

export async function databaseRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, config, runtime, databases: service } = ctx;

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

  async function projectExists(id: string) {
    if (!UUID.test(id)) throw new HttpError(404, "Project not found");
    const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id));
    if (!row) throw new HttpError(404, "Project not found");
  }

  app.get("/api/databases", { preHandler: requireAuth }, async () => ({
    databases: await loadDatabases(db, {}),
  }));

  app.get<IdParams>("/api/projects/:id/databases", { preHandler: requireAuth }, async (request) => {
    await projectExists(request.params.id);
    return { databases: await loadDatabases(db, { projectId: request.params.id }) };
  });

  app.post<IdParams>(
    "/api/projects/:id/databases",
    { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = parseBody(databaseInputSchema, request, reply);
      if (!input) return;
      await projectExists(request.params.id);
      const box = secretBox(config.NOCAP_SECRET);
      const engine = DATABASE_ENGINES[input.engine];
      const [row] = await db
        .insert(databases)
        .values({
          projectId: request.params.id,
          name: input.name,
          engine: input.engine,
          version: input.version ?? engine.versions[0] ?? "latest",
          dbName: input.engine === "redis" ? "0" : (input.dbName ?? "app"),
          username: ENGINE_SPECS[input.engine].username,
          passwordEnc: box.seal(generatePassword()),
          status: "starting",
        })
        .returning();
      if (!row) throw new Error("Database was not created");
      await record(request, "database.created", row.id, { engine: row.engine });
      service.start(row);
      return reply.code(201).send({ database: await findDatabase(db, row.id) });
    },
  );

  app.get<IdParams>("/api/databases/:id", { preHandler: requireAuth }, async (request) => ({
    database: await findDatabase(db, request.params.id),
  }));

  app.get<IdParams>(
    "/api/databases/:id/connection",
    { preHandler: requireAuth },
    async (request): Promise<DatabaseConnection> => {
      const row = await databaseRow(db, request.params.id);
      const password = service.password(row);
      await record(request, "database.connection_viewed", row.id);
      return { password, url: connectionUrl(row, password) };
    },
  );

  app.post<{ Params: { id: string; action: string } }>(
    "/api/databases/:id/actions/:action",
    { preHandler: requireAuth },
    async (request) => {
      const action = request.params.action as DatabaseAction;
      if (!ACTIONS.includes(action)) throw new HttpError(404, "Unknown action");
      const row = await databaseRow(db, request.params.id);
      if (row.status === "starting") throw new HttpError(409, "The database is still starting.");
      const container = await runtime.databaseContainer(row.id).catch(() => {
        throw new HttpError(503, "Docker is not reachable on this server.");
      });
      if (!container || (row.status === "failed" && action !== "stop")) {
        // Never started (or it failed): start from scratch. The volume keeps any data.
        if (action === "stop") throw new HttpError(409, "The database is not running.");
        service.start(row);
      } else {
        await runtime.action(container.id, action);
        await db
          .update(databases)
          .set({ status: action === "stop" ? "stopped" : "running", error: null })
          .where(eq(databases.id, row.id));
      }
      await record(request, `database.${action}`, row.id);
      return { database: await findDatabase(db, row.id) };
    },
  );

  app.get<IdParams & { Querystring: { tail?: string } }>(
    "/api/databases/:id/logs",
    { preHandler: requireAuth },
    async (request) => {
      const row = await databaseRow(db, request.params.id);
      const tail = Math.min(Math.max(Number(request.query.tail) || 200, 10), 2000);
      const container = await runtime.databaseContainer(row.id).catch(() => null);
      if (!container) return { logs: "", running: false };
      return {
        logs: await runtime.logs(container.id, tail).catch(() => ""),
        running: container.running,
      };
    },
  );

  app.delete<IdParams & { Querystring: { keepData?: string } }>(
    "/api/databases/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const current = await findDatabase(db, request.params.id);
      if (current.status === "starting") {
        throw new HttpError(409, "Wait for the database to finish starting.");
      }
      if (current.links.length > 0) {
        const names = [...new Set(current.links.map((link) => link.applicationName))].join(", ");
        throw new HttpError(409, `Unlink it from ${names} first.`);
      }
      const keepData = request.query.keepData === "true";
      await service.destroy(current.id, keepData).catch(() => {
        throw new HttpError(503, "Docker is not reachable on this server.");
      });
      await db.delete(databases).where(eq(databases.id, current.id));
      await record(request, "database.deleted", current.id, { name: current.name, keepData });
      return reply.code(204).send();
    },
  );

  // ---------------------------------------------------------------- links

  app.post<IdParams>(
    "/api/databases/:id/links",
    { preHandler: requireAuth },
    async (request, reply) => {
      const input = parseBody(databaseLinkSchema, request, reply);
      if (!input) return;
      const row = await databaseRow(db, request.params.id);
      const [target] = await db
        .select({ id: applications.id, projectId: applications.projectId })
        .from(applications)
        .where(eq(applications.id, input.applicationId));
      if (!target) throw new HttpError(404, "Application not found");
      if (target.projectId !== row.projectId) {
        throw new HttpError(400, "Link apps from the same project as the database.");
      }
      const variable = input.variable ?? DATABASE_ENGINES[row.engine].variable;
      const conflict = (message: string) =>
        reply
          .code(400)
          .send({ error: "Check the highlighted fields", fields: { variable: message } });
      const [ownVar] = await db
        .select({ id: envVars.id })
        .from(envVars)
        .where(and(eq(envVars.applicationId, target.id), eq(envVars.key, variable)));
      if (ownVar) {
        return conflict(
          `The app already has ${variable} in Environment. Remove it or pick another name.`,
        );
      }
      const [taken] = await db
        .select({ id: databaseLinks.id })
        .from(databaseLinks)
        .where(
          and(eq(databaseLinks.applicationId, target.id), eq(databaseLinks.variable, variable)),
        );
      if (taken) return conflict(`The app already gets ${variable} from a linked database.`);

      const [link] = await db
        .insert(databaseLinks)
        .values({ databaseId: row.id, applicationId: target.id, variable })
        .returning({ id: databaseLinks.id });
      if (!link) throw new Error("Link was not created");
      await record(request, "database.linked", row.id, { application: target.id, variable });
      return reply.code(201).send({ database: await findDatabase(db, row.id) });
    },
  );

  app.delete<IdParams>(
    "/api/database-links/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!UUID.test(request.params.id)) throw new HttpError(404, "Link not found");
      const [link] = await db
        .delete(databaseLinks)
        .where(eq(databaseLinks.id, request.params.id))
        .returning();
      if (!link) throw new HttpError(404, "Link not found");
      await record(request, "database.unlinked", link.databaseId, {
        application: link.applicationId,
        variable: link.variable,
      });
      return reply.code(204).send();
    },
  );

  // ---------------------------------------------------------------- usage

  /** CPU and memory of every service in a project, keyed by app or database id. */
  app.get<IdParams>("/api/projects/:id/usage", { preHandler: requireAuth }, async (request) => {
    await projectExists(request.params.id);
    const [apps, dbs, stats] = await Promise.all([
      db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.projectId, request.params.id)),
      db
        .select({ id: databases.id })
        .from(databases)
        .where(eq(databases.projectId, request.params.id)),
      runtime.stats().catch(() => null),
    ]);
    if (!stats) return { available: false, usage: {} };
    const usage: Record<string, ContainerUsage> = {};
    for (const { id } of apps) {
      // App containers are nocap-<app>-<deployment>; while a deploy switches over there can be two.
      const prefix = `nocap-${short(id)}-`;
      const own = stats.filter((s) => s.name.startsWith(prefix));
      if (own.length > 0) {
        usage[id] = {
          cpu: own.reduce((sum, s) => sum + s.cpu, 0),
          memory: own.reduce((sum, s) => sum + s.memory, 0),
        };
      }
    }
    for (const { id } of dbs) {
      const own = stats.find((s) => s.name === `nocap-db-${short(id)}`);
      if (own) usage[id] = { cpu: own.cpu, memory: own.memory };
    }
    return { available: true, usage };
  });
}
