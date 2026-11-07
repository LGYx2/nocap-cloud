import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { migrationsFolder, schema } from "@nocap/db";
import { buildApp } from "./app";
import { deleteExpiredSessions } from "./auth/sessions";
import { loadConfig } from "./config";

const config = loadConfig();

const logger =
  config.NODE_ENV === "development"
    ? { level: config.LOG_LEVEL, transport: { target: "pino-pretty" } }
    : { level: config.LOG_LEVEL };

const client = postgres(config.DATABASE_URL, { max: 10, onnotice: () => {} });
const db = drizzle(client, { schema });

await migrate(db, { migrationsFolder });

const app = await buildApp({ db, config }, logger);
await app.deployer.recover();
await app.databases.recover();

const cleanup = setInterval(
  () => {
    deleteExpiredSessions(db).catch((err: unknown) =>
      app.log.error({ err }, "session cleanup failed"),
    );
  },
  60 * 60 * 1000,
);
cleanup.unref();

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "shutting down");
  clearInterval(cleanup);
  await app.close();
  await client.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.HOST, port: config.PORT });
app.log.info({ version: config.NOCAP_VERSION }, "Nocap Cloud is running");
