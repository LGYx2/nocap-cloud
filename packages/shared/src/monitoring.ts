import { z } from "zod";
import type { DatabaseEngine, StackId } from "./catalog";

export const MONITOR_RANGES = ["1h", "24h", "7d"] as const;
export type MonitorRange = (typeof MONITOR_RANGES)[number];

export interface MetricPoint {
  /** Start of the time slot, in milliseconds since 1970. */
  t: number;
  /** Services: percent of one core. Server: load as a percent of all cores. */
  cpu: number;
  /** Bytes. */
  memory: number;
}

export interface MonitoredService {
  id: string;
  kind: "app" | "database";
  name: string;
  projectId: string;
  projectName: string;
  status: string;
  stack: StackId | null;
  engine: DatabaseEngine | null;
  /** Latest reading, or null when the service is not running. */
  cpu: number | null;
  memory: number | null;
  /** CPU over the range, oldest first, for a small chart. */
  spark: number[];
  /** Apps only: percent of checks that got an answer in the range. */
  uptime: number | null;
  /** Apps only: average answer time in the range. */
  responseMs: number | null;
}

export type IncidentKind = "app_down" | "deploy_failed" | "server_memory" | "server_disk";

export interface Incident {
  id: string;
  kind: IncidentKind;
  /** Application the incident is about, when there is one. */
  targetId: string | null;
  title: string;
  detail: string | null;
  startedAt: string;
  /** Null while it is still going on. */
  resolvedAt: string | null;
}

export interface MonitoringOverview {
  range: MonitorRange;
  server: { cpus: number; memoryTotal: number; points: MetricPoint[] };
  services: MonitoredService[];
  incidents: Incident[];
}

export interface UptimePoint {
  t: number;
  /** Share of checks in the slot that got an answer, 0 to 1. */
  up: number;
  ms: number | null;
}

export interface ServiceSeries {
  range: MonitorRange;
  points: MetricPoint[];
  checks: UptimePoint[];
  uptime: number | null;
  responseMs: number | null;
}

export interface AlertSettings {
  /** Host of the webhook that gets alerts, like hooks.slack.com. The full URL is never sent back. */
  webhookHost: string | null;
}

export const alertSettingsSchema = z.object({
  webhookUrl: z.union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .max(500)
      .regex(/^https:\/\/[a-z0-9.-]+(:\d+)?\/\S*$/i, {
        error: "Use an https:// webhook address",
      }),
  ]),
});
export type AlertSettingsInput = z.input<typeof alertSettingsSchema>;
