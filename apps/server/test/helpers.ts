import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { FastifyInstance } from "fastify";
import { migrationsFolder, schema, type Database } from "@nocap/db";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  close: () => Promise<void>;
}

/** A full app on an in-memory Postgres (PGlite) with all migrations applied. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  const client = new PGlite();
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder });
  const db = pglite as unknown as Database;

  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "pglite://memory",
    NOCAP_VERSION: "test",
    ...env,
  });
  const app = await buildApp({ db, config });
  await app.ready();

  return {
    app,
    db,
    close: async () => {
      await app.close();
      await client.close();
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
