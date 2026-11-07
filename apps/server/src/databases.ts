// One-click databases: starting their containers in the background and turning rows into
// API shapes.
import { desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { applications, databaseLinks, databases, projects, type Database } from "@nocap/db";
import { DATABASE_ENGINES, type DatabaseLink, type ManagedDatabase } from "@nocap/shared";
import type { Config } from "./config";
import { SecretBox } from "./crypto";
import {
  connectionUrl,
  databaseHost,
  databaseImage,
  databaseVolume,
  ENGINE_SPECS,
} from "./engines";
import { HttpError } from "./http";
import { CommandError, type Runtime } from "./runtime";
import { UUID } from "./views";

interface Logger {
  error: (obj: unknown, msg?: string) => void;
}

export interface DatabaseServiceOptions {
  db: Database;
  config: Config;
  runtime: Runtime;
  log: Logger;
}

type DatabaseRow = typeof databases.$inferSelect;

export class DatabaseService {
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly options: DatabaseServiceOptions) {}

  /** Starts the database's container in the background. Its status says how it went. */
  start(row: DatabaseRow): void {
    const job = this.boot(row).finally(() => this.pending.delete(job));
    this.pending.add(job);
  }

  /** Resolves when no database is starting. Used by tests. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  /** After a restart, a database that was starting never finished. */
  async recover(): Promise<void> {
    await this.options.db
      .update(databases)
      .set({ status: "failed", error: "Interrupted by a restart of Nocap. Start it again." })
      .where(eq(databases.status, "starting"));
  }

  password(row: Pick<DatabaseRow, "passwordEnc">): string {
    if (!this.options.config.NOCAP_SECRET) {
      throw new HttpError(503, "Set NOCAP_SECRET (32+ characters) on the server to use databases.");
    }
    return new SecretBox(this.options.config.NOCAP_SECRET).open(row.passwordEnc);
  }

  private async boot(row: DatabaseRow): Promise<void> {
    const { db, runtime, config } = this.options;
    const lines: string[] = [];
    try {
      await db
        .update(databases)
        .set({ status: "starting", error: null })
        .where(eq(databases.id, row.id));
      const existing = await runtime.databaseContainer(row.id);
      if (existing) await runtime.remove(existing.id);
      const spec = ENGINE_SPECS[row.engine];
      await runtime.startDatabase(
        {
          databaseId: row.id,
          name: databaseHost(row.id),
          image: databaseImage(row),
          env: spec.env(row, this.password(row)),
          volume: databaseVolume(row.id),
          dataPath: spec.dataPath,
          command: spec.command,
          network: config.DOCKER_NETWORK,
        },
        (line) => {
          lines.push(line);
          if (lines.length > 5) lines.shift();
        },
      );
      await db.update(databases).set({ status: "running" }).where(eq(databases.id, row.id));
    } catch (err) {
      const detail = err instanceof CommandError ? (lines.at(-1) ?? err.message) : null;
      if (!(err instanceof CommandError)) this.options.log.error({ err }, "database start failed");
      const error = detail ? `Could not start: ${detail}`.slice(0, 300) : "Could not start.";
      await db
        .update(databases)
        .set({ status: "failed", error })
        .where(eq(databases.id, row.id))
        .catch(() => undefined);
    }
  }

  /** Removes the container and, unless kept, the volume with all the data. */
  async destroy(id: string, keepData = false): Promise<void> {
    const { runtime } = this.options;
    const container = await runtime.databaseContainer(id).catch(() => null);
    if (container) await runtime.remove(container.id);
    if (!keepData) await runtime.removeVolume(databaseVolume(id)).catch(() => undefined);
  }

  /** Connection URLs for the databases linked to an app, by variable name. */
  async linkedEnv(applicationId: string): Promise<Record<string, string>> {
    const rows = await this.options.db
      .select({ variable: databaseLinks.variable, database: getTableColumns(databases) })
      .from(databaseLinks)
      .innerJoin(databases, eq(databases.id, databaseLinks.databaseId))
      .where(eq(databaseLinks.applicationId, applicationId));
    return Object.fromEntries(
      rows.map((row) => [row.variable, connectionUrl(row.database, this.password(row.database))]),
    );
  }
}

// ---------------------------------------------------------------- views

export async function loadDatabases(
  db: Database,
  where: { projectId?: string; id?: string },
): Promise<ManagedDatabase[]> {
  const base = db
    .select({ ...getTableColumns(databases), projectName: projects.name })
    .from(databases)
    .innerJoin(projects, eq(projects.id, databases.projectId))
    .orderBy(desc(databases.createdAt));
  const rows = where.id
    ? await base.where(eq(databases.id, where.id))
    : where.projectId
      ? await base.where(eq(databases.projectId, where.projectId))
      : await base;
  if (rows.length === 0) return [];

  const links = await db
    .select({
      id: databaseLinks.id,
      databaseId: databaseLinks.databaseId,
      applicationId: databaseLinks.applicationId,
      applicationName: applications.name,
      variable: databaseLinks.variable,
    })
    .from(databaseLinks)
    .innerJoin(applications, eq(applications.id, databaseLinks.applicationId))
    .where(
      inArray(
        databaseLinks.databaseId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(databaseLinks.createdAt);

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    name: row.name,
    engine: row.engine,
    version: row.version,
    status: row.status,
    error: row.error,
    host: databaseHost(row.id),
    port: DATABASE_ENGINES[row.engine].port,
    dbName: row.dbName,
    username: row.username,
    links: links.filter((link): link is DatabaseLink => link.databaseId === row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function findDatabase(db: Database, id: string): Promise<ManagedDatabase> {
  if (!UUID.test(id)) throw new HttpError(404, "Database not found");
  const [row] = await loadDatabases(db, { id });
  if (!row) throw new HttpError(404, "Database not found");
  return row;
}

export async function databaseRow(db: Database, id: string): Promise<DatabaseRow> {
  if (!UUID.test(id)) throw new HttpError(404, "Database not found");
  const [row] = await db.select().from(databases).where(eq(databases.id, id));
  if (!row) throw new HttpError(404, "Database not found");
  return row;
}
