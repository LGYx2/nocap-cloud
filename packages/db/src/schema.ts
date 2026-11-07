import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Panel users. Phase 0 has one admin; teams arrive in v0.4. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

/** Login sessions. `id` is the SHA-256 hash of the cookie token, never the token itself. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/** Key-value settings for the install, such as `setup_completed`. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_at_idx").on(t.createdAt)],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const buildTypeEnum = pgEnum("build_type", ["dockerfile", "compose"]);
export const appStatusEnum = pgEnum("app_status", [
  "idle",
  "building",
  "running",
  "stopped",
  "failed",
]);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    repoUrl: text("repo_url"),
    branch: text("branch").notNull().default("main"),
    buildType: buildTypeEnum("build_type").notNull().default("dockerfile"),
    dockerfilePath: text("dockerfile_path").notNull().default("Dockerfile"),
    port: integer("port"),
    status: appStatusEnum("status").notNull().default("idle"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("applications_project_id_idx").on(t.projectId)],
);

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "queued",
  "building",
  "running",
  "failed",
  "rolled_back",
  "superseded",
]);

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha"),
    commitMessage: text("commit_message"),
    imageTag: text("image_tag"),
    status: deploymentStatusEnum("status").notNull().default("queued"),
    logPath: text("log_path"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("deployments_application_id_idx").on(t.applicationId, t.createdAt)],
);

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    https: boolean("https").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("domains_hostname_unique").on(sql`lower(${t.hostname})`)],
);

/** Environment variables. Values are encrypted with AES-256-GCM before they are stored (phase 3). */
export const envVars = pgTable(
  "env_vars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEnc: text("value_enc").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("env_vars_app_key_unique").on(t.applicationId, t.key)],
);
