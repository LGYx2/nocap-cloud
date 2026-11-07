import { statfs } from "node:fs/promises";
import os from "node:os";
import { count, gte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { applications, deployments, projects } from "@nocap/db";
import type { Overview, ServerStats } from "@nocap/shared";
import type { AppContext } from "../app";
import { requireAuth } from "../http";
import { selectDeployments, toDeployment } from "../views";

async function serverStats(dataDir: string): Promise<ServerStats> {
  const cpus = os.cpus().length || 1;
  let disk: ServerStats["disk"] = null;
  try {
    const fs = await statfs(dataDir).catch(() => statfs("."));
    const total = fs.blocks * fs.bsize;
    disk = { total, used: total - fs.bavail * fs.bsize };
  } catch {
    // Not available on this platform.
  }
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    cpus,
    load: Math.round(((os.loadavg()[0] ?? 0) / cpus) * 100) / 100,
    memory: { total: os.totalmem(), used: os.totalmem() - os.freemem() },
    disk,
    uptime: Math.round(os.uptime()),
  };
}

export async function overviewRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, runtime, config } = ctx;

  app.get("/api/overview", { preHandler: requireAuth }, async (): Promise<Overview> => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const [[projectCount], statusRows, [today], recent, server, docker] = await Promise.all([
      db.select({ n: count() }).from(projects),
      db
        .select({ status: applications.status, n: count() })
        .from(applications)
        .groupBy(applications.status),
      db.select({ n: count() }).from(deployments).where(gte(deployments.createdAt, since)),
      selectDeployments(db).limit(8),
      serverStats(config.DATA_DIR),
      runtime.info(),
    ]);
    const byStatus = (status: string) => statusRows.find((r) => r.status === status)?.n ?? 0;
    return {
      counts: {
        projects: projectCount?.n ?? 0,
        applications: statusRows.reduce((sum, row) => sum + row.n, 0),
        running: byStatus("running"),
        failed: byStatus("failed"),
      },
      deploymentsToday: today?.n ?? 0,
      recentDeployments: recent.map(toDeployment),
      server,
      docker,
    };
  });
}
