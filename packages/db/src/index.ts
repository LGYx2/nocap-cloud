import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Schema = typeof schema;

/** A Drizzle database for our schema, whatever the driver (postgres-js in production, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

/**
 * Folder with the SQL migrations. Resolves to `packages/db/drizzle` in development
 * and to `/app/drizzle` next to the bundled server in the Docker image.
 */
export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
