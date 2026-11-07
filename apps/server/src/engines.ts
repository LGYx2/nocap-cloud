// How each one-click database runs: the variables its official image reads on first start,
// where it keeps data, and how an app connects to it.
import { randomBytes } from "node:crypto";
import { DATABASE_ENGINES, type DatabaseEngine } from "@nocap/shared";
import { short } from "./runtime";

export interface EngineRow {
  id: string;
  engine: DatabaseEngine;
  version: string;
  dbName: string;
  username: string;
}

interface EngineSpec {
  dataPath: string;
  /** User name the image creates. */
  username: string;
  env(row: EngineRow, password: string): Record<string, string>;
  command?: string[];
  url(row: EngineRow, password: string, host: string): string;
}

const enc = encodeURIComponent;

export const ENGINE_SPECS: Record<DatabaseEngine, EngineSpec> = {
  postgres: {
    dataPath: "/var/lib/postgresql/data",
    username: "nocap",
    env: (row, password) => ({
      POSTGRES_USER: row.username,
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: row.dbName,
    }),
    url: (row, password, host) =>
      `postgresql://${enc(row.username)}:${enc(password)}@${host}:5432/${row.dbName}`,
  },
  mysql: {
    dataPath: "/var/lib/mysql",
    username: "nocap",
    env: (row, password) => ({
      MYSQL_USER: row.username,
      MYSQL_PASSWORD: password,
      MYSQL_DATABASE: row.dbName,
      MYSQL_ROOT_PASSWORD: password,
    }),
    url: (row, password, host) =>
      `mysql://${enc(row.username)}:${enc(password)}@${host}:3306/${row.dbName}`,
  },
  mariadb: {
    dataPath: "/var/lib/mysql",
    username: "nocap",
    env: (row, password) => ({
      MARIADB_USER: row.username,
      MARIADB_PASSWORD: password,
      MARIADB_DATABASE: row.dbName,
      MARIADB_ROOT_PASSWORD: password,
    }),
    url: (row, password, host) =>
      `mysql://${enc(row.username)}:${enc(password)}@${host}:3306/${row.dbName}`,
  },
  mongodb: {
    dataPath: "/data/db",
    username: "nocap",
    env: (row, password) => ({
      MONGO_INITDB_ROOT_USERNAME: row.username,
      MONGO_INITDB_ROOT_PASSWORD: password,
      MONGO_INITDB_DATABASE: row.dbName,
    }),
    url: (row, password, host) =>
      `mongodb://${enc(row.username)}:${enc(password)}@${host}:27017/${row.dbName}?authSource=admin`,
  },
  redis: {
    dataPath: "/data",
    username: "default",
    env: (_row, password) => ({ REDIS_PASSWORD: password }),
    // The password comes from the environment, so it never shows in the host's process list.
    // The image's entrypoint still runs, so Redis drops root as usual.
    command: [
      "sh",
      "-c",
      'exec docker-entrypoint.sh redis-server --requirepass "$REDIS_PASSWORD" --appendonly yes',
    ],
    url: (_row, password, host) => `redis://default:${enc(password)}@${host}:6379/0`,
  },
};

/** Container name and hostname on the Nocap network. */
export const databaseHost = (id: string) => `nocap-db-${short(id)}`;
export const databaseVolume = (id: string) => `nocap-db-${short(id)}-data`;
export const databaseImage = (row: Pick<EngineRow, "engine" | "version">) =>
  `${DATABASE_ENGINES[row.engine].image}:${row.version}`;

export function connectionUrl(row: EngineRow, password: string): string {
  return ENGINE_SPECS[row.engine].url(row, password, databaseHost(row.id));
}

/** URL-safe, so connection strings never need escaping. 32 characters. */
export const generatePassword = () => randomBytes(24).toString("base64url");
