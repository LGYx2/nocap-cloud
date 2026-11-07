import { z } from "zod";
import {
  DATABASE_ENGINE_IDS,
  DATABASE_ENGINES,
  type DatabaseEngine,
  type DatabaseStatus,
} from "./catalog";
import { APP_NAME_MAX, ENV_KEY_MAX } from "./constants";

// ---------------------------------------------------------------- databases

const envKey = z
  .string()
  .trim()
  .min(1, { error: "Enter a name" })
  .max(ENV_KEY_MAX)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, { error: "Letters, numbers and _ only" });

export const databaseInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Give the database a name" })
      .max(APP_NAME_MAX, { error: `Keep it under ${APP_NAME_MAX} characters` }),
    engine: z.enum(DATABASE_ENGINE_IDS as [DatabaseEngine, ...DatabaseEngine[]], {
      error: "Pick a database",
    }),
    version: z.string().trim().optional(),
    dbName: z
      .string()
      .trim()
      .max(63)
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, { error: "Letters, numbers and _ only" })
      .optional(),
  })
  .refine(
    (input) => !input.version || DATABASE_ENGINES[input.engine].versions.includes(input.version),
    {
      path: ["version"],
      error: "Pick one of the listed versions",
    },
  );
export type DatabaseInput = z.input<typeof databaseInputSchema>;

export const databaseLinkSchema = z.object({
  applicationId: z.uuid({ error: "Pick an app" }),
  /** Defaults to the engine's usual name, like DATABASE_URL. */
  variable: envKey.optional(),
});
export type DatabaseLinkInput = z.input<typeof databaseLinkSchema>;

export interface DatabaseLink {
  id: string;
  databaseId: string;
  applicationId: string;
  applicationName: string;
  variable: string;
}

export interface ManagedDatabase {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  engine: DatabaseEngine;
  version: string;
  status: DatabaseStatus;
  error: string | null;
  /** Hostname other containers on the Nocap network use to reach it. */
  host: string;
  port: number;
  dbName: string;
  username: string;
  links: DatabaseLink[];
  createdAt: string;
  updatedAt: string;
}

/** Returned only by GET /api/databases/:id/connection. */
export interface DatabaseConnection {
  password: string;
  /** Connection URL for apps on the same server. */
  url: string;
}

export type DatabaseAction = "start" | "stop" | "restart";

// ---------------------------------------------------------------- usage

export interface ContainerUsage {
  /** Percent of one CPU core, so 150 means one and a half cores. */
  cpu: number;
  /** Bytes. */
  memory: number;
}
