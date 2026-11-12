import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
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

export const gitProviderTypeEnum = pgEnum("git_provider_type", ["github", "gitlab"]);

/**
 * Connected Git accounts. `configEnc` is encrypted JSON: for GitHub, the GitHub App this install
 * created (id, private key, webhook secret, installations); for GitLab, the URL and an access token.
 */
export const gitProviders = pgTable("git_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: gitProviderTypeEnum("type").notNull(),
  name: text("name").notNull(),
  configEnc: text("config_enc").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** "dockerfile" builds a Git repository; "image" runs a ready-made image from a registry. */
export const buildTypeEnum = pgEnum("build_type", ["dockerfile", "compose", "image"]);
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
    /** Set when the repository comes from a connected account (private repos, deploy on push). */
    gitProviderId: uuid("git_provider_id").references(() => gitProviders.id, {
      onDelete: "set null",
    }),
    /** owner/name, used to match push webhooks to apps. */
    repoFullName: text("repo_full_name"),
    autoDeploy: boolean("auto_deploy").notNull().default(true),
    /** Secret part of the deploy hook URL, so any CI can trigger a deploy. */
    deployToken: text("deploy_token")
      .notNull()
      .default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`),
    branch: text("branch").notNull().default("main"),
    buildType: buildTypeEnum("build_type").notNull().default("dockerfile"),
    dockerfilePath: text("dockerfile_path").notNull().default("Dockerfile"),
    image: text("image"),
    port: integer("port"),
    /** Runs in the new image before traffic moves to it, for database migrations. */
    releaseCommand: text("release_command"),
    /** Language or framework found in the repository on the last deploy, like "nextjs". */
    stack: text("stack"),
    status: appStatusEnum("status").notNull().default("idle"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("applications_project_id_idx").on(t.projectId),
    index("applications_repo_idx").on(t.repoFullName),
    uniqueIndex("applications_deploy_token_unique").on(t.deployToken),
  ],
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
    /** What started it: "manual", "redeploy" or, later, "push". */
    trigger: text("trigger").notNull().default("manual"),
    /** Short reason shown in the panel when the deployment failed. */
    error: text("error"),
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

export const databaseEngineEnum = pgEnum("database_engine", [
  "postgres",
  "mysql",
  "mariadb",
  "mongodb",
  "redis",
]);
export const databaseStatusEnum = pgEnum("database_status", [
  "starting",
  "running",
  "stopped",
  "failed",
]);

/** One-click databases. Each runs in its own container with a named volume for its data. */
export const databases = pgTable(
  "databases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    engine: databaseEngineEnum("engine").notNull(),
    /** Image tag, like 17-alpine. */
    version: text("version").notNull(),
    dbName: text("db_name").notNull(),
    username: text("username").notNull(),
    /** Generated password, encrypted with AES-256-GCM. */
    passwordEnc: text("password_enc").notNull(),
    status: databaseStatusEnum("status").notNull().default("starting"),
    /** Short reason shown in the panel when the database could not start. */
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("databases_project_id_idx").on(t.projectId)],
);

/** A database linked to an app: the app gets the connection URL in `variable` on deploy. */
export const databaseLinks = pgTable(
  "database_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    databaseId: uuid("database_id")
      .notNull()
      .references(() => databases.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    variable: text("variable").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("database_links_app_variable_unique").on(t.applicationId, t.variable),
    index("database_links_database_id_idx").on(t.databaseId),
  ],
);

/**
 * CPU and memory, one row per service per minute, kept for 7 days. `target` is an application
 * or database id, or "server" for the machine itself.
 */
export const metrics = pgTable(
  "metrics",
  {
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    target: text("target").notNull(),
    /** Services: percent of one core. Server: load as a percent of all cores. */
    cpu: real("cpu").notNull(),
    /** Bytes in use. */
    memory: bigint("memory", { mode: "number" }).notNull(),
  },
  (t) => [index("metrics_target_at_idx").on(t.target, t.at)],
);

/** One row per app per minute: did the app answer on its port, and how fast. */
export const uptimeChecks = pgTable(
  "uptime_checks",
  {
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    ok: boolean("ok").notNull(),
    /** HTTP status, or null when nothing answered. */
    status: integer("status"),
    ms: integer("ms"),
  },
  (t) => [index("uptime_checks_app_at_idx").on(t.applicationId, t.at)],
);

/** Things that went wrong: an app stopped answering, a deploy failed, the server is full. */
export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "app_down", "deploy_failed", "server_memory" or "server_disk". */
    kind: text("kind").notNull(),
    /** Application id, or null for the server. */
    targetId: text("target_id"),
    title: text("title").notNull(),
    detail: text("detail"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null while it is still going on. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("incidents_started_at_idx").on(t.startedAt)],
);
