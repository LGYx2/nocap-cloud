import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { FastifyInstance } from "fastify";
import { migrationsFolder, schema, type Database } from "@nocap/db";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { DatabaseService } from "../src/databases";
import { Deployer } from "../src/deployer";
import { GitService } from "../src/git";
import { Monitor, type CheckResult } from "../src/monitor";
import { fakeGitHosts } from "./fake-git";
import { FakeRuntime } from "./fake-runtime";

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  runtime: FakeRuntime;
  deployer: Deployer;
  databases: DatabaseService;
  monitor: Monitor;
  /** Add a part of an app's address (its short id) to make its uptime checks fail. */
  down: Set<string>;
  /** Messages the monitor sent to the alert webhook. */
  alerts: Array<Record<string, unknown>>;
  /** Share of server memory and disk in use, as the monitor sees it. */
  server: { memory: number; disk: number };
  gitCalls: ReturnType<typeof fakeGitHosts>["calls"];
  close: () => Promise<void>;
}

/** A full app on an in-memory Postgres (PGlite) with all migrations applied. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  const client = new PGlite();
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder });
  const db = pglite as unknown as Database;

  const dataDir = await mkdtemp(join(tmpdir(), "nocap-test-"));
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "pglite://memory",
    NOCAP_VERSION: "test",
    NOCAP_SECRET: "test-secret-that-is-at-least-32-characters",
    DATA_DIR: dataDir,
    ...env,
  });
  const runtime = new FakeRuntime();
  const hosts = fakeGitHosts();
  const git = new GitService(db, config, hosts.fetch);
  const quiet = { info: () => {}, error: () => {} };
  const databases = new DatabaseService({ db, config, runtime, log: quiet });
  const deployer = new Deployer({ db, config, runtime, git, databases, log: quiet, settleMs: 0 });
  // Apps answer unless a test says otherwise; alerts are collected instead of sent.
  const down = new Set<string>();
  const alerts: Array<Record<string, unknown>> = [];
  const server = { memory: 0.4, disk: 0.3 };
  const monitor = new Monitor({
    db,
    config,
    runtime,
    log: quiet,
    check: async (url): Promise<CheckResult> =>
      [...down].some((part) => url.includes(part))
        ? { ok: false, status: null, ms: null }
        : { ok: true, status: 200, ms: 12 },
    send: async (_url, body) => {
      alerts.push(body);
    },
    stats: async () => ({
      hostname: "test",
      platform: "Linux",
      cpus: 4,
      load: 0.25,
      memory: { total: 8e9, used: 8e9 * server.memory },
      disk: { total: 80e9, used: 80e9 * server.disk },
      uptime: 1000,
    }),
  });
  const app = await buildApp({ db, config, runtime, deployer, git, databases, monitor });
  await app.ready();

  return {
    app,
    db,
    runtime,
    deployer,
    databases,
    monitor,
    down,
    alerts,
    server,
    gitCalls: hosts.calls,
    close: async () => {
      await deployer.idle();
      await databases.idle();
      await app.close();
      await client.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

export const admin = {
  name: "Test Admin",
  email: "admin@example.com",
  password: "correct horse battery",
};

/** Returns the session cookie from a response as a `name=value` string for the next request. */
export function sessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!header) throw new Error("No set-cookie header");
  const pair = header.split(";")[0];
  if (!pair) throw new Error("Malformed set-cookie header");
  return pair;
}
