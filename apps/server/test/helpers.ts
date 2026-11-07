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
import { Deployer } from "../src/deployer";
import { GitService } from "../src/git";
import { fakeGitHosts } from "./fake-git";
import { FakeRuntime } from "./fake-runtime";

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  runtime: FakeRuntime;
  deployer: Deployer;
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
  const deployer = new Deployer({ db, config, runtime, git, log: quiet, settleMs: 0 });
  const app = await buildApp({ db, config, runtime, deployer, git });
  await app.ready();

  return {
    app,
    db,
    runtime,
    deployer,
    gitCalls: hosts.calls,
    close: async () => {
      await deployer.idle();
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
