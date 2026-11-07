import { countDistinct, desc, eq, getTableColumns } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { applications, databases, projects, type Database } from "@nocap/db";
import { projectInputSchema, projectUpdateSchema, type Project } from "@nocap/shared";
import { audit } from "../audit";
import { HttpError, parseBody, requireAuth } from "../http";
import type { AppContext } from "../app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProjectRow = typeof projects.$inferSelect & {
  applicationCount: number;
  databaseCount: number;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    applicationCount: row.applicationCount,
    databaseCount: row.databaseCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Projects with the number of applications and databases in each, newest first. */
function selectProjects(db: Database) {
  return db
    .select({
      ...getTableColumns(projects),
      applicationCount: countDistinct(applications.id),
      databaseCount: countDistinct(databases.id),
    })
    .from(projects)
    .leftJoin(applications, eq(applications.projectId, projects.id))
    .leftJoin(databases, eq(databases.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));
}

async function findProject(db: Database, id: string): Promise<Project> {
  if (!UUID.test(id)) throw new HttpError(404, "Project not found");
  const [row] = await selectProjects(db).where(eq(projects.id, id));
  if (!row) throw new HttpError(404, "Project not found");
  return toProject(row);
}

export async function projectRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, runtime, databases: service } = ctx;

  app.get("/api/projects", { preHandler: requireAuth }, async () => {
    const rows = await selectProjects(db);
    return { projects: rows.map(toProject) };
  });

  app.post("/api/projects", { preHandler: requireAuth }, async (request, reply) => {
    const input = parseBody(projectInputSchema, request, reply);
    if (!input) return;
    const [created] = await db
      .insert(projects)
      .values({ name: input.name, description: input.description })
      .returning({ id: projects.id });
    if (!created) throw new Error("Project was not created");
    await audit(
      db,
      {
        action: "project.created",
        userId: request.user?.id,
        targetType: "project",
        targetId: created.id,
        ip: request.ip,
      },
      request.log,
    );
    return reply.code(201).send({ project: await findProject(db, created.id) });
  });

  app.get<{ Params: { id: string } }>(
    "/api/projects/:id",
    { preHandler: requireAuth },
    async (request) => ({ project: await findProject(db, request.params.id) }),
  );

  app.patch<{ Params: { id: string } }>(
    "/api/projects/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const input = parseBody(projectUpdateSchema, request, reply);
      if (!input) return;
      const current = await findProject(db, request.params.id);
      const changes: Partial<typeof projects.$inferInsert> = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.description !== undefined) changes.description = input.description;
      if (Object.keys(changes).length > 0) {
        await db.update(projects).set(changes).where(eq(projects.id, current.id));
        await audit(
          db,
          {
            action: "project.updated",
            userId: request.user?.id,
            targetType: "project",
            targetId: current.id,
            ip: request.ip,
          },
          request.log,
        );
      }
      return { project: await findProject(db, current.id) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/projects/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const current = await findProject(db, request.params.id);
      const apps = await db
        .select({ id: applications.id, status: applications.status })
        .from(applications)
        .where(eq(applications.projectId, current.id));
      if (apps.some((a) => a.status === "building")) {
        throw new HttpError(409, "Wait for running deployments to finish first.");
      }
      const dbs = await db
        .select({ id: databases.id, status: databases.status })
        .from(databases)
        .where(eq(databases.projectId, current.id));
      if (dbs.some((d) => d.status === "starting")) {
        throw new HttpError(409, "Wait for databases to finish starting first.");
      }
      // Remove what runs on the server, not only the rows.
      for (const { id } of apps) {
        const containers = await runtime.containers(id).catch(() => []);
        for (const c of containers) await runtime.remove(c.id).catch(() => undefined);
      }
      for (const { id } of dbs) await service.destroy(id).catch(() => undefined);
      await db.delete(projects).where(eq(projects.id, current.id));
      await audit(
        db,
        {
          action: "project.deleted",
          userId: request.user?.id,
          targetType: "project",
          targetId: current.id,
          metadata: { name: current.name },
          ip: request.ip,
        },
        request.log,
      );
      return reply.code(204).send();
    },
  );
}
