// Monitoring without extra containers: once a minute Nocap reads CPU and memory of the server
// and of every service, asks each running app for an answer on its port, and writes one small
// row each to Postgres. Rows older than 7 days are deleted. Incidents (an app stopped
// answering, a deploy failed, the server is full) are recorded and sent to the alert webhook.
import { and, eq, gt, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import {
  applications,
  databases,
  deployments,
  incidents,
  metrics,
  settings,
  uptimeChecks,
  type Database,
} from "@nocap/db";
import type { IncidentKind, ServerStats } from "@nocap/shared";
import type { Config } from "./config";
import { SecretBox } from "./crypto";
import { short, type Runtime } from "./runtime";
import { serverStats } from "./server-stats";

export interface CheckResult {
  ok: boolean;
  status: number | null;
  ms: number | null;
}
export type HttpCheck = (url: string) => Promise<CheckResult>;
export type SendAlert = (url: string, body: Record<string, unknown>) => Promise<void>;

interface Logger {
  error: (obj: unknown, msg?: string) => void;
}

export interface MonitorOptions {
  db: Database;
  config: Config;
  runtime: Runtime;
  log: Logger;
  check?: HttpCheck;
  send?: SendAlert;
  stats?: () => Promise<ServerStats>;
}

export const ALERT_WEBHOOK_KEY = "alert_webhook";
const KEEP_METRICS_DAYS = 7;
const KEEP_INCIDENTS_DAYS = 30;
/** Failed checks in a row before an app counts as down, so one slow answer is not an alert. */
const DOWN_AFTER = 2;
const MEMORY_HIGH = 0.92;
const DISK_HIGH = 0.9;

/** Any answer below 500 means the app is up; a 404 on "/" is still an app that answers. */
const httpCheck: HttpCheck = async (url) => {
  const started = performance.now();
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    await response.body?.cancel();
    return {
      ok: response.status < 500,
      status: response.status,
      ms: Math.round(performance.now() - started),
    };
  } catch {
    return { ok: false, status: null, ms: null };
  }
};

const postJson: SendAlert = async (url, body) => {
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
};

export class Monitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private ticks = 0;
  private since = new Date();
  private readonly failures = new Map<string, number>();
  private readonly check: HttpCheck;
  private readonly send: SendAlert;

  constructor(private readonly options: MonitorOptions) {
    this.check = options.check ?? httpCheck;
    this.send = options.send ?? postJson;
  }

  start(intervalMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One round of sampling. Never throws: monitoring must not take the panel down. */
  async tick(now = new Date()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.sample(now);
      this.ticks += 1;
      if (this.ticks % 60 === 1) await this.cleanup(now);
    } catch (err) {
      this.options.log.error({ err }, "monitoring round failed");
    } finally {
      this.busy = false;
    }
  }

  private async sample(now: Date): Promise<void> {
    const { db, config, runtime } = this.options;
    const [server, stats, apps, dbs] = await Promise.all([
      (this.options.stats ?? (() => serverStats(config.DATA_DIR)))(),
      runtime.stats().catch(() => null),
      db
        .select({
          id: applications.id,
          name: applications.name,
          port: applications.port,
          status: applications.status,
        })
        .from(applications),
      db.select({ id: databases.id }).from(databases),
    ]);

    const rows = [
      {
        at: now,
        target: "server",
        cpu: Math.round(server.load * 1000) / 10,
        memory: server.memory.used,
      },
    ];
    for (const app of apps) {
      // App containers are nocap-<app>-<deployment>; during a switch there can be two.
      const own = (stats ?? []).filter((s) => s.name.startsWith(`nocap-${short(app.id)}-`));
      if (own.length === 0) continue;
      rows.push({
        at: now,
        target: app.id,
        cpu: own.reduce((sum, s) => sum + s.cpu, 0),
        memory: own.reduce((sum, s) => sum + s.memory, 0),
      });
    }
    for (const { id } of dbs) {
      const own = (stats ?? []).find((s) => s.name === `nocap-db-${short(id)}`);
      if (own) rows.push({ at: now, target: id, cpu: own.cpu, memory: own.memory });
    }
    await db.insert(metrics).values(rows);

    // Without Docker nothing can answer, and that is not the apps' fault.
    if (stats) await this.checkApps(apps, now);
    await this.failedDeployments(now);
    await this.serverLimits(server, now);
  }

  private async checkApps(
    apps: Array<{ id: string; name: string; port: number | null; status: string }>,
    now: Date,
  ): Promise<void> {
    const { db } = this.options;
    const running = apps.filter((app) => app.status === "running");
    const results = await Promise.all(
      running.map(async (app) => ({
        app,
        result: await this.check(`http://nocap-${short(app.id)}:${app.port ?? 3000}/`),
      })),
    );
    if (results.length > 0) {
      await db.insert(uptimeChecks).values(
        results.map(({ app, result }) => ({
          at: now,
          applicationId: app.id,
          ok: result.ok,
          status: result.status,
          ms: result.ms,
        })),
      );
    }

    const open = await db
      .select({ id: incidents.id, targetId: incidents.targetId })
      .from(incidents)
      .where(and(eq(incidents.kind, "app_down"), isNull(incidents.resolvedAt)));
    const openFor = (appId: string) => open.find((incident) => incident.targetId === appId);

    for (const { app, result } of results) {
      if (result.ok) {
        this.failures.delete(app.id);
        const incident = openFor(app.id);
        if (incident) await this.resolve(incident.id, `${app.name} is answering again.`, now);
        continue;
      }
      const count = (this.failures.get(app.id) ?? 0) + 1;
      this.failures.set(app.id, count);
      if (count >= DOWN_AFTER && !openFor(app.id)) {
        await this.open(
          "app_down",
          app.id,
          `${app.name} is not answering`,
          result.status
            ? `It answers with HTTP ${result.status} on port ${app.port ?? 3000}.`
            : `No answer on port ${app.port ?? 3000}.`,
          now,
        );
      }
    }

    // An app someone stopped or deleted is not "down" any more.
    const runningIds = new Set(running.map((app) => app.id));
    const stale = open.filter(
      (incident) => !incident.targetId || !runningIds.has(incident.targetId),
    );
    if (stale.length > 0) {
      await db
        .update(incidents)
        .set({ resolvedAt: now })
        .where(
          inArray(
            incidents.id,
            stale.map((incident) => incident.id),
          ),
        );
    }
  }

  private async failedDeployments(now: Date): Promise<void> {
    const { db } = this.options;
    const failed = await db
      .select({
        applicationId: deployments.applicationId,
        error: deployments.error,
        name: applications.name,
      })
      .from(deployments)
      .innerJoin(applications, eq(applications.id, deployments.applicationId))
      .where(and(eq(deployments.status, "failed"), gt(deployments.finishedAt, this.since)));
    this.since = now;
    for (const row of failed) {
      // A failed deploy is an event, not a state: it is recorded as already over.
      await this.open(
        "deploy_failed",
        row.applicationId,
        `Deployment of ${row.name} failed`,
        row.error,
        now,
        true,
      );
    }
  }

  private async serverLimits(server: ServerStats, now: Date): Promise<void> {
    const memory = server.memory.used / server.memory.total;
    const disk = server.disk ? server.disk.used / server.disk.total : 0;
    await this.limit(
      "server_memory",
      memory,
      MEMORY_HIGH,
      "Server memory is almost full",
      `${Math.round(memory * 100)}% of memory is in use.`,
      now,
    );
    await this.limit(
      "server_disk",
      disk,
      DISK_HIGH,
      "Server disk is almost full",
      `${Math.round(disk * 100)}% of the disk is in use.`,
      now,
    );
  }

  private async limit(
    kind: IncidentKind,
    value: number,
    high: number,
    title: string,
    detail: string,
    now: Date,
  ): Promise<void> {
    const [open] = await this.options.db
      .select({ id: incidents.id })
      .from(incidents)
      .where(and(eq(incidents.kind, kind), isNull(incidents.resolvedAt)));
    if (value >= high && !open) await this.open(kind, null, title, detail, now);
    // A few points below the limit, so a value sitting on the line does not flap.
    if (open && value < high - 0.04) await this.resolve(open.id, `${title}: back to normal.`, now);
  }

  private async open(
    kind: IncidentKind,
    targetId: string | null,
    title: string,
    detail: string | null,
    now: Date,
    over = false,
  ): Promise<void> {
    await this.options.db
      .insert(incidents)
      .values({ kind, targetId, title, detail, startedAt: now, resolvedAt: over ? now : null });
    await this.alert(`${title}.${detail ? ` ${detail}` : ""}`, kind, over ? "event" : "open");
  }

  private async resolve(id: string, text: string, now: Date): Promise<void> {
    const [row] = await this.options.db
      .update(incidents)
      .set({ resolvedAt: now })
      .where(eq(incidents.id, id))
      .returning({ kind: incidents.kind });
    await this.alert(text, row?.kind ?? "app_down", "resolved");
  }

  /** The alert webhook's address, or null when alerts are off. */
  async webhook(): Promise<string | null> {
    const { db, config } = this.options;
    if (!config.NOCAP_SECRET) return null;
    const [row] = await db.select().from(settings).where(eq(settings.key, ALERT_WEBHOOK_KEY));
    if (typeof row?.value !== "string") return null;
    try {
      return new SecretBox(config.NOCAP_SECRET).open(row.value);
    } catch {
      return null;
    }
  }

  /** Sends a message to the webhook. Slack reads `text`, Discord reads `content`. */
  async alert(text: string, event: string, state: string): Promise<boolean> {
    const url = await this.webhook();
    if (!url) return false;
    const message = `Nocap Cloud: ${text}`;
    try {
      await this.send(url, { text: message, content: message, event, state });
      return true;
    } catch (err) {
      this.options.log.error({ err }, "alert webhook failed");
      return false;
    }
  }

  private async cleanup(now: Date): Promise<void> {
    const { db } = this.options;
    const day = 86_400_000;
    const old = new Date(now.getTime() - KEEP_METRICS_DAYS * day);
    await db.delete(metrics).where(lt(metrics.at, old));
    await db.delete(uptimeChecks).where(lt(uptimeChecks.at, old));
    await db
      .delete(incidents)
      .where(
        and(
          isNotNull(incidents.resolvedAt),
          lt(incidents.startedAt, new Date(now.getTime() - KEEP_INCIDENTS_DAYS * day)),
        ),
      );
  }
}
