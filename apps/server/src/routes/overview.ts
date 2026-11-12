import { count, gte, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { applications, databases, deployments, incidents, projects } from "@nocap/db";
import type { Overview } from "@nocap/shared";
import type { AppContext } from "../app";
import { requireAuth } from "../http";
import { serverStats } from "../server-stats";
import { selectDeployments, toDeployment } from "../views";

export async function overviewRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, runtime, config } = ctx;

  app.get("/api/overview", { preHandler: requireAuth }, async (): Promise<Overview> => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 13);
    const day = sql<string>`to_char(${deployments.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    const [[projectCount], statusRows, [today], recent, server, docker, perDay, [dbCount], [open]] =
      await Promise.all([
        db.select({ n: count() }).from(projects),
        db
          .select({ status: applications.status, n: count() })
          .from(applications)
          .groupBy(applications.status),
        db.select({ n: count() }).from(deployments).where(gte(deployments.createdAt, since)),
        selectDeployments(db).limit(8),
        serverStats(config.DATA_DIR),
        runtime.info(),
        db
          .select({
            day,
            total: count(),
            failed: sql<number>`count(*) filter (where ${deployments.status} = 'failed')`.mapWith(
              Number,
            ),
          })
          .from(deployments)
          .where(gte(deployments.createdAt, start))
          .groupBy(day),
        db.select({ n: count() }).from(databases),
        db.select({ n: count() }).from(incidents).where(isNull(incidents.resolvedAt)),
      ]);
    const activity = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const row = perDay.find((r) => r.day === date);
      return { date, total: row?.total ?? 0, failed: row?.failed ?? 0 };
    });
    const byStatus = (status: string) => statusRows.find((r) => r.status === status)?.n ?? 0;
    return {
      counts: {
        projects: projectCount?.n ?? 0,
        applications: statusRows.reduce((sum, row) => sum + row.n, 0),
        running: byStatus("running"),
        failed: byStatus("failed"),
        databases: dbCount?.n ?? 0,
        incidents: open?.n ?? 0,
      },
      deploymentsToday: today?.n ?? 0,
      activity,
      recentDeployments: recent.map(toDeployment),
      server,
      docker,
    };
  });
}
