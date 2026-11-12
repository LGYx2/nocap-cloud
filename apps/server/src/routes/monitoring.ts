import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { incidents, metrics, settings, uptimeChecks } from "@nocap/db";
import {
  alertSettingsSchema,
  MONITOR_RANGES,
  type AlertSettings,
  type Incident,
  type IncidentKind,
  type MetricPoint,
  type MonitoredService,
  type MonitoringOverview,
  type MonitorRange,
  type ServiceSeries,
} from "@nocap/shared";
import type { AppContext } from "../app";
import { audit } from "../audit";
import { secretBox } from "../crypto";
import { loadDatabases } from "../databases";
import { HttpError, parseBody, requireAuth } from "../http";
import { ALERT_WEBHOOK_KEY } from "../monitor";
import { serverStats } from "../server-stats";
import { loadApplications, UUID } from "../views";

/** How far back each range goes and how wide one point is, so every chart has under 100 points. */
const RANGES: Record<MonitorRange, { ms: number; bucket: number }> = {
  "1h": { ms: 3_600_000, bucket: 60 },
  "24h": { ms: 86_400_000, bucket: 900 },
  "7d": { ms: 7 * 86_400_000, bucket: 7200 },
};

const readRange = (value: unknown): MonitorRange =>
  MONITOR_RANGES.includes(value as MonitorRange) ? (value as MonitorRange) : "1h";

/** Start of the time slot a row falls in, in seconds. The slot width is one of our own constants. */
const slot = (column: typeof metrics.at | typeof uptimeChecks.at, seconds: number) =>
  sql<number>`floor(extract(epoch from ${column}) / ${sql.raw(String(seconds))}) * ${sql.raw(String(seconds))}`.mapWith(
    Number,
  );

const toIncident = (row: typeof incidents.$inferSelect): Incident => ({
  id: row.id,
  kind: row.kind as IncidentKind,
  targetId: row.targetId,
  title: row.title,
  detail: row.detail,
  startedAt: row.startedAt.toISOString(),
  resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
});

export async function monitoringRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, config, monitor } = ctx;

  async function series(range: MonitorRange, target?: string) {
    const { ms, bucket } = RANGES[range];
    const since = new Date(Date.now() - ms);
    const t = slot(metrics.at, bucket);
    return db
      .select({
        target: metrics.target,
        t,
        cpu: sql<number>`avg(${metrics.cpu})`.mapWith(Number),
        memory: sql<number>`avg(${metrics.memory})`.mapWith(Number),
      })
      .from(metrics)
      .where(
        target ? and(gte(metrics.at, since), eq(metrics.target, target)) : gte(metrics.at, since),
      )
      .groupBy(metrics.target, t)
      .orderBy(t);
  }

  const toPoint = (row: { t: number; cpu: number; memory: number }): MetricPoint => ({
    t: row.t * 1000,
    cpu: Math.round(row.cpu * 10) / 10,
    memory: Math.round(row.memory),
  });

  app.get<{ Querystring: { range?: string } }>(
    "/api/monitoring",
    { preHandler: requireAuth },
    async (request): Promise<MonitoringOverview> => {
      const range = readRange(request.query.range);
      const { ms, bucket } = RANGES[range];
      const since = new Date(Date.now() - ms);
      const [rows, uptime, apps, dbs, server, recent] = await Promise.all([
        series(range),
        db
          .select({
            id: uptimeChecks.applicationId,
            up: sql<number>`avg(case when ${uptimeChecks.ok} then 100.0 else 0 end)`.mapWith(
              Number,
            ),
            ms: sql<number | null>`avg(${uptimeChecks.ms}) filter (where ${uptimeChecks.ok})`,
          })
          .from(uptimeChecks)
          .where(gte(uptimeChecks.at, since))
          .groupBy(uptimeChecks.applicationId),
        loadApplications(db, {}),
        loadDatabases(db, {}),
        serverStats(config.DATA_DIR),
        db.select().from(incidents).orderBy(desc(incidents.startedAt)).limit(30),
      ]);

      const byTarget = new Map<string, MetricPoint[]>();
      for (const row of rows) {
        const list = byTarget.get(row.target) ?? [];
        list.push(toPoint(row));
        byTarget.set(row.target, list);
      }
      // A reading counts as current when it is from the last couple of slots.
      const fresh = Date.now() - Math.max(bucket * 2000, 180_000);
      const usage = (id: string, live: boolean) => {
        const points = byTarget.get(id) ?? [];
        const last = points.at(-1);
        const current = live && last && last.t >= fresh ? last : null;
        return {
          cpu: current?.cpu ?? null,
          memory: current?.memory ?? null,
          spark: points.map((p) => p.cpu),
        };
      };

      const services: MonitoredService[] = [
        ...apps.map((a) => {
          const checks = uptime.find((u) => u.id === a.id);
          return {
            id: a.id,
            kind: "app" as const,
            name: a.name,
            projectId: a.projectId,
            projectName: a.projectName,
            status: a.status,
            stack: a.stack,
            engine: null,
            ...usage(a.id, a.status === "running"),
            uptime: checks ? Math.round(checks.up * 100) / 100 : null,
            responseMs: checks?.ms != null ? Math.round(Number(checks.ms)) : null,
          };
        }),
        ...dbs.map((d) => ({
          id: d.id,
          kind: "database" as const,
          name: d.name,
          projectId: d.projectId,
          projectName: d.projectName,
          status: d.status,
          stack: null,
          engine: d.engine,
          ...usage(d.id, d.status === "running"),
          uptime: null,
          responseMs: null,
        })),
      ];

      return {
        range,
        server: {
          cpus: server.cpus,
          memoryTotal: server.memory.total,
          points: byTarget.get("server") ?? [],
        },
        services,
        // Ongoing incidents first, then the newest.
        incidents: recent
          .map(toIncident)
          .sort((a, b) => Number(Boolean(a.resolvedAt)) - Number(Boolean(b.resolvedAt))),
      };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { range?: string } }>(
    "/api/monitoring/services/:id",
    { preHandler: requireAuth },
    async (request): Promise<ServiceSeries> => {
      const { id } = request.params;
      if (id !== "server" && !UUID.test(id)) throw new HttpError(404, "Service not found");
      const range = readRange(request.query.range);
      const { ms, bucket } = RANGES[range];
      const since = new Date(Date.now() - ms);
      const t = slot(uptimeChecks.at, bucket);
      const [rows, checks] = await Promise.all([
        series(range, id),
        id === "server"
          ? []
          : db
              .select({
                t,
                up: sql<number>`avg(case when ${uptimeChecks.ok} then 1.0 else 0 end)`.mapWith(
                  Number,
                ),
                ms: sql<number | null>`avg(${uptimeChecks.ms}) filter (where ${uptimeChecks.ok})`,
                n: sql<number>`count(*)`.mapWith(Number),
              })
              .from(uptimeChecks)
              .where(and(gte(uptimeChecks.at, since), eq(uptimeChecks.applicationId, id)))
              .groupBy(t)
              .orderBy(t),
      ]);
      const total = checks.reduce((sum, c) => sum + c.n, 0);
      const answered = checks.filter((c) => c.ms != null);
      return {
        range,
        points: rows.map(toPoint),
        checks: checks.map((c) => ({
          t: c.t * 1000,
          up: Math.round(c.up * 1000) / 1000,
          ms: c.ms != null ? Math.round(Number(c.ms)) : null,
        })),
        uptime: total
          ? Math.round((checks.reduce((sum, c) => sum + c.up * c.n, 0) / total) * 10_000) / 100
          : null,
        responseMs: answered.length
          ? Math.round(answered.reduce((sum, c) => sum + Number(c.ms), 0) / answered.length)
          : null,
      };
    },
  );

  // ---------------------------------------------------------------- alerts

  async function alertSettings(): Promise<AlertSettings> {
    const url = await monitor.webhook();
    return { webhookHost: url ? new URL(url).host : null };
  }

  app.get("/api/monitoring/alerts", { preHandler: requireAuth }, async () => ({
    alerts: await alertSettings(),
  }));

  app.put("/api/monitoring/alerts", { preHandler: requireAuth }, async (request, reply) => {
    const input = parseBody(alertSettingsSchema, request, reply);
    if (!input) return;
    if (input.webhookUrl) {
      // The address is a secret: whoever has it can post to the channel.
      const value = secretBox(config.NOCAP_SECRET).seal(input.webhookUrl);
      await db
        .insert(settings)
        .values({ key: ALERT_WEBHOOK_KEY, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } });
    } else {
      await db.delete(settings).where(eq(settings.key, ALERT_WEBHOOK_KEY));
    }
    await audit(db, { action: "alerts.updated", userId: request.user?.id, ip: request.ip });
    return { alerts: await alertSettings() };
  });

  app.post(
    "/api/monitoring/alerts/test",
    { preHandler: requireAuth, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async () => {
      if (!(await monitor.webhook())) throw new HttpError(409, "Save a webhook address first.");
      const sent = await monitor.alert(
        "This is a test alert. Alerts are set up correctly.",
        "test",
        "event",
      );
      if (!sent) throw new HttpError(502, "The webhook did not accept the message.");
      return { sent };
    },
  );
}
