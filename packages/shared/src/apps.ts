import { z } from "zod";
import { APP_NAME_MAX, ENV_KEY_MAX, ENV_VALUE_MAX, ENV_VARS_MAX } from "./constants";

// ---------------------------------------------------------------- applications

export type AppSource = "git" | "image";
export type AppStatus = "idle" | "building" | "running" | "stopped" | "failed";
export type DeploymentStatus =
  "queued" | "building" | "running" | "failed" | "rolled_back" | "superseded";

/** https:// Git URLs only, so nothing can be passed to git as an option or a local path. */
const repoUrl = z
  .string()
  .trim()
  .max(300)
  .regex(/^https:\/\/[a-z0-9.-]+(:\d+)?\/[\w.~/-]+$/i, {
    error: "Use an https:// address, like https://github.com/you/app.git",
  });

const branch = z
  .string()
  .trim()
  .min(1, { error: "Enter a branch" })
  .max(100)
  .regex(/^(?!-)(?!.*\.\.)[\w./-]+$/, { error: "Letters, numbers, / . _ and - only" });

const dockerfilePath = z
  .string()
  .trim()
  .min(1, { error: "Enter the Dockerfile path" })
  .max(200)
  .regex(/^(?!\/)(?!.*\.\.)[\w./-]+$/, { error: "A path inside the repository, like Dockerfile" });

/** Docker image reference: registry/name:tag or @sha256 digest. */
const image = z
  .string()
  .trim()
  .min(1, { error: "Enter an image, like nginx:alpine" })
  .max(255)
  .regex(/^[a-z0-9][a-z0-9._/:@-]*$/, { error: "Lowercase image name, like nginx:alpine" });

const port = z.coerce
  .number({ error: "Enter a port" })
  .int({ error: "Enter a whole number" })
  .min(1, { error: "Between 1 and 65535" })
  .max(65535, { error: "Between 1 and 65535" });

const appName = z
  .string()
  .trim()
  .min(1, { error: "Give the app a name" })
  .max(APP_NAME_MAX, { error: `Keep it under ${APP_NAME_MAX} characters` });

export const applicationInputSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("git"),
    name: appName,
    repoUrl,
    branch: branch.default("main"),
    dockerfilePath: dockerfilePath.default("Dockerfile"),
    port: port.default(3000),
  }),
  z.object({
    source: z.literal("image"),
    name: appName,
    image,
    port: port.default(80),
  }),
]);
export type ApplicationInput = z.input<typeof applicationInputSchema>;

export const applicationUpdateSchema = z.object({
  name: appName.optional(),
  repoUrl: repoUrl.optional(),
  branch: branch.optional(),
  dockerfilePath: dockerfilePath.optional(),
  image: image.optional(),
  port: port.optional(),
});
export type ApplicationUpdate = z.input<typeof applicationUpdateSchema>;

export interface Application {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  source: AppSource;
  repoUrl: string | null;
  branch: string;
  dockerfilePath: string;
  image: string | null;
  port: number;
  status: AppStatus;
  domains: string[];
  lastDeployment: Deployment | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- deployments

export interface Deployment {
  id: string;
  applicationId: string;
  applicationName: string;
  projectId: string;
  status: DeploymentStatus;
  trigger: string;
  commitSha: string | null;
  commitMessage: string | null;
  imageTag: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface DeploymentLog {
  /** Log text from `offset` on. Ask again with `next` to get only what is new. */
  text: string;
  next: number;
  done: boolean;
}

// ---------------------------------------------------------------- domains

export const domainInputSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(/^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/, {
      error: "Enter a domain, like app.example.com",
    }),
});
export type DomainInput = z.input<typeof domainInputSchema>;

export interface Domain {
  id: string;
  applicationId: string;
  hostname: string;
  https: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------- environment

export const envVarsSchema = z.object({
  vars: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .min(1, { error: "Enter a name" })
          .max(ENV_KEY_MAX)
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, { error: "Letters, numbers and _ only" }),
        value: z.string().max(ENV_VALUE_MAX, { error: "Value is too long" }),
      }),
    )
    .max(ENV_VARS_MAX, { error: `Up to ${ENV_VARS_MAX} variables` })
    .refine((vars) => new Set(vars.map((v) => v.key)).size === vars.length, {
      error: "Each name can appear only once",
    }),
});
export type EnvVarsInput = z.input<typeof envVarsSchema>;

export interface EnvVar {
  key: string;
  value: string;
}

// ---------------------------------------------------------------- overview

export interface ServerStats {
  hostname: string;
  platform: string;
  cpus: number;
  /** 1-minute load average divided by the number of CPUs, 0 to 1 and above. */
  load: number;
  memory: { total: number; used: number };
  disk: { total: number; used: number } | null;
  uptime: number;
}

export interface DockerInfo {
  available: boolean;
  version: string | null;
  containersRunning: number;
}

export interface Overview {
  counts: { projects: number; applications: number; running: number; failed: number };
  deploymentsToday: number;
  recentDeployments: Deployment[];
  server: ServerStats;
  docker: DockerInfo;
}

export type AppAction = "start" | "stop" | "restart";
