// Demo mode: a fake API that runs in the browser, so the panel can be tried without a server.
// Built only when VITE_DEMO=true (`pnpm build:demo`); the normal build never includes this file.
//
// Deployments are played back on a clock: each one has a script of log lines with times, and
// its status follows from how long ago it started. Nothing really runs.
//
// The demo validates with the server's own zod schemas. This file is loaded lazily and only in
// the demo build, so zod never reaches the normal panel bundle.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import {
  applicationInputSchema,
  applicationUpdateSchema,
  domainInputSchema,
  envVarsSchema,
  type ApiError,
  type Application,
  type AppStatus,
  type Deployment,
  type Domain,
  type EnvVar,
  type GitProvider,
  type GitRepo,
  type Overview,
  type Project,
  type PublicUser,
} from "@nocap/shared";
import { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX } from "@nocap/shared/constants";

const STORAGE_KEY = "nocap-demo-v3";

const DEMO_GITHUB: GitProvider = {
  id: "9a000000-0000-4000-8000-000000000001",
  type: "github",
  name: "GitHub · meridian-labs",
  url: "https://github.com/apps/nocap-demo",
  installed: true,
  installUrl: "https://github.com/apps/nocap-demo/installations/new",
  createdAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
};

/** Repositories the sample accounts can see. */
const DEMO_REPOS: Record<string, GitRepo[]> = {
  [DEMO_GITHUB.id]: [
    ["meridian-labs/api", true, 0.6],
    ["meridian-labs/workers", true, 1.8],
    ["meridian-labs/admin", true, 0.4],
    ["meridian-labs/storefront", true, 30],
    ["meridian-labs/marketing-site", false, 72],
    ["meridian-labs/mobile-api", true, 200],
  ].map(([fullName, isPrivate, hours]) => ({
    fullName: String(fullName),
    url: `https://github.com/${fullName}.git`,
    private: Boolean(isPrivate),
    defaultBranch: "main",
    updatedAt: new Date(Date.now() - Number(hours) * 3600_000).toISOString(),
  })),
};

export const DEMO_USER: PublicUser = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Demo User",
  email: "demo@nocap.cloud",
};

type DemoProject = Omit<Project, "applicationCount">;
type DemoApp = Omit<Application, "projectName" | "domains" | "lastDeployment">;
type DemoDeployment = Omit<Deployment, "applicationName" | "projectId"> & {
  /** Planned outcome, revealed when the script ends. */
  outcome: "running" | "failed";
};

export interface DemoState {
  signedIn: boolean;
  projects: DemoProject[];
  apps: DemoApp[];
  deployments: DemoDeployment[];
  domains: Domain[];
  env: Record<string, EnvVar[]>;
  providers: GitProvider[];
  panelUrl: string | null;
}

export interface DemoResponse {
  status: number;
  data: unknown;
}

const hoursAgo = (hours: number, now: number) => new Date(now - hours * 3600_000).toISOString();

// ---------------------------------------------------------------- sample data

const P = {
  meridian: "a1111111-1111-4111-8111-111111111111",
  harbor: "b2222222-2222-4222-8222-222222222222",
  lumen: "c3333333-3333-4333-8333-333333333333",
  ops: "d4444444-4444-4444-8444-444444444444",
};

const COMMITS = [
  "Add rate limiting to the public endpoints",
  "Cache report queries for five minutes",
  "Fix timezone in the weekly digest",
  "Upgrade to Node 22",
  "Show build number in the footer",
  "Retry webhook deliveries with backoff",
];

const sha = (seed: number) =>
  Array.from({ length: 40 }, (_, i) => "0123456789abcdef"[(seed * 7 + i * 13) % 16]).join("");

/** Sample projects, apps and a deployment history a visitor sees on the first visit. */
export function seedState(now = Date.now()): DemoState {
  const project = (
    id: string,
    name: string,
    description: string | null,
    created: number,
    updated: number,
  ): DemoProject => ({
    id,
    name,
    description,
    createdAt: hoursAgo(created, now),
    updatedAt: hoursAgo(updated, now),
  });
  const app = (
    id: string,
    projectId: string,
    name: string,
    source: "git" | "image",
    where: string,
    port: number,
    status: AppStatus,
    created: number,
  ): DemoApp => ({
    id,
    projectId,
    name,
    source,
    repoUrl: source === "git" ? where : null,
    branch: "main",
    dockerfilePath: "Dockerfile",
    image: source === "image" ? where : null,
    port,
    status,
    // Meridian's repositories come through the sample GitHub account and deploy on push.
    gitProvider: where.includes("meridian-labs")
      ? { id: DEMO_GITHUB.id, type: "github", name: DEMO_GITHUB.name }
      : null,
    autoDeploy: where.includes("meridian-labs"),
    deployToken: id.replaceAll("-", "").repeat(2),
    createdAt: hoursAgo(created, now),
    updatedAt: hoursAgo(created, now),
  });

  const apps: DemoApp[] = [
    app(
      "e1000000-0000-4000-8000-000000000001",
      P.meridian,
      "API server",
      "git",
      "https://github.com/meridian-labs/api.git",
      3000,
      "running",
      2,
    ),
    app(
      "e1000000-0000-4000-8000-000000000002",
      P.meridian,
      "Webhook worker",
      "git",
      "https://github.com/meridian-labs/workers.git",
      8080,
      "running",
      2,
    ),
    app(
      "e1000000-0000-4000-8000-000000000003",
      P.meridian,
      "Admin console",
      "git",
      "https://github.com/meridian-labs/admin.git",
      3000,
      "failed",
      1.5,
    ),
    app(
      "e1000000-0000-4000-8000-000000000004",
      P.harbor,
      "Ingest",
      "git",
      "https://github.com/harbor-data/ingest.git",
      4000,
      "running",
      30,
    ),
    app(
      "e1000000-0000-4000-8000-000000000005",
      P.harbor,
      "Dashboards",
      "image",
      "grafana/grafana:11.3.0",
      3000,
      "running",
      28,
    ),
    app(
      "e1000000-0000-4000-8000-000000000006",
      P.lumen,
      "Docs site",
      "image",
      "nginx:1.27-alpine",
      80,
      "running",
      24 * 9,
    ),
  ];

  const domains: Domain[] = [
    ["e1000000-0000-4000-8000-000000000001", "api.meridian.dev"],
    ["e1000000-0000-4000-8000-000000000003", "admin.meridian.dev"],
    ["e1000000-0000-4000-8000-000000000004", "ingest.harbor.io"],
    ["e1000000-0000-4000-8000-000000000005", "dash.harbor.io"],
    ["e1000000-0000-4000-8000-000000000006", "docs.lumen.app"],
  ].map(([applicationId = "", hostname = ""], i) => ({
    id: `f2000000-0000-4000-8000-00000000000${i + 1}`,
    applicationId,
    hostname,
    https: true,
    createdAt: hoursAgo(20 - i, now),
  }));

  const deployments: DemoDeployment[] = [];
  let n = 1;
  const past = (
    appId: string,
    hours: number,
    status: DemoDeployment["status"],
    seconds: number,
    error?: string,
  ) => {
    const target = apps.find((a) => a.id === appId);
    const created = now - hours * 3600_000;
    deployments.push({
      id: `d3000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      applicationId: appId,
      status,
      outcome: status === "failed" ? "failed" : "running",
      trigger: n % 3 === 0 ? "manual" : "redeploy",
      commitSha: target?.source === "git" ? sha(n) : null,
      commitMessage: target?.source === "git" ? (COMMITS[n % COMMITS.length] ?? null) : null,
      imageTag:
        target?.source === "image"
          ? target.image
          : `nocap/${appId.slice(0, 8)}:${String(n).padStart(8, "0")}`,
      error: error ?? null,
      startedAt: new Date(created + 1000).toISOString(),
      finishedAt: new Date(created + 1000 + seconds * 1000).toISOString(),
      createdAt: new Date(created).toISOString(),
    });
    n += 1;
  };
  const [api, worker, admin, ingest, dash, docs] = apps.map((a) => a.id) as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  past(docs, 24 * 8, "superseded", 14);
  past(docs, 24 * 2, "running", 12);
  past(dash, 26, "running", 21);
  past(ingest, 29, "superseded", 74);
  past(ingest, 5, "running", 68);
  past(worker, 1.8, "running", 52);
  past(api, 1.9, "superseded", 61);
  past(api, 0.6, "running", 58);
  past(admin, 0.4, "failed", 39, "build failed (exit code 1). See the log for details.");

  return {
    signedIn: true,
    projects: [
      project(
        P.meridian,
        "Meridian API",
        "Public REST API, webhook workers and the admin console.",
        2,
        1,
      ),
      project(
        P.harbor,
        "Harbor Analytics",
        "Event ingestion pipeline and reporting dashboards.",
        30,
        5,
      ),
      project(P.lumen, "Lumen Docs", null, 24 * 9, 24 * 2),
      project(
        P.ops,
        "Ops Toolkit",
        "Status page, uptime checks and internal dashboards.",
        24 * 40,
        24 * 20,
      ),
    ],
    apps,
    deployments,
    domains,
    providers: [DEMO_GITHUB],
    panelUrl: "https://panel.meridian.dev",
    env: {
      [api]: [
        { key: "DATABASE_URL", value: "postgres://meridian:demo@db:5432/meridian" },
        { key: "JWT_SECRET", value: "demo-only-not-a-real-secret" },
        { key: "LOG_LEVEL", value: "info" },
      ],
      [ingest]: [{ key: "KAFKA_BROKERS", value: "kafka:9092" }],
    },
  };
}

export function loadState(): DemoState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as DemoState;
  } catch {
    // Storage blocked or corrupt: start from the sample data.
  }
  return seedState();
}

function saveState(current: DemoState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // The demo still works for this page view.
  }
}

/** Forget the visitor's changes and start again from the sample data. */
export function resetDemo(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("nocap-demo"); // the first demo's data
  } catch {
    // Nothing saved.
  }
}

/** A random v4 UUID. crypto.randomUUID only exists on https pages, so build one by hand. */
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const ok = (data: unknown, status = 200): DemoResponse => ({ status, data });
const fail = (status: number, error: string, fields?: Record<string, string>): DemoResponse => ({
  status,
  data: { error, ...(fields ? { fields } : {}) } satisfies ApiError,
});

type Body = Record<string, unknown> | undefined;

function readProjectInput(body: Body, partial: boolean) {
  const fields: Record<string, string> = {};
  const result: { name?: string; description?: string | null } = {};

  if (!partial || body?.name !== undefined) {
    const name = String(body?.name ?? "").trim();
    if (!name) fields.name = "Give the project a name";
    else if (name.length > PROJECT_NAME_MAX)
      fields.name = `Keep it under ${PROJECT_NAME_MAX} characters`;
    else result.name = name;
  }
  if (!partial || body?.description !== undefined) {
    const description = String(body?.description ?? "").trim();
    if (description.length > PROJECT_DESCRIPTION_MAX)
      fields.description = `Keep it under ${PROJECT_DESCRIPTION_MAX} characters`;
    else result.description = description || null;
  }
  return { fields, result };
}

interface Schema<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

/** Validates with the same schema as the server; returns the data or a 400 response. */
function parse<T>(schema: Schema<T>, body: Body): T | DemoResponse {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fields[issue.path.map(String).join(".") || "_"] ??= issue.message;
  }
  return fail(400, "Check the highlighted fields", fields);
}
const isResponse = (value: unknown): value is DemoResponse =>
  typeof value === "object" && value !== null && "status" in value && "data" in value;

// ---------------------------------------------------------------- deployment playback

interface Script {
  lines: Array<[number, string]>;
  total: number;
}

function script(app: DemoApp, d: DemoDeployment, domains: string[], envCount: number): Script {
  const lines: Array<[number, string]> = [[0, `Deployment ${d.id.slice(0, 8)} of ${app.name}`]];
  let t = 300;
  const add = (gap: number, text: string) => {
    t += gap;
    lines.push([t, text]);
  };
  if (app.source === "image") {
    add(0, "");
    add(0, `==> Pulling ${app.image}`);
    add(
      500,
      `${(app.image ?? "").split(":")[1] ?? "latest"}: Pulling from library/${(app.image ?? "").split(":")[0]}`,
    );
    add(600, "a2318d6c47ec: Pull complete");
    add(700, "4f4fb700ef54: Pull complete");
    add(500, "Digest: sha256:9b4d6d2a1e0c7f3b5a8e2d1c0b9a8f7e6d5c4b3a2918f7e6d5c4b3a29187f6e5");
    add(300, `Status: Downloaded newer image for ${app.image}`);
  } else {
    add(0, "");
    add(0, `==> Cloning ${app.repoUrl} (${app.branch})`);
    add(400, `Cloning into '/app/data/builds/${d.id}'...`);
    add(800, `Commit ${d.commitSha?.slice(0, 7)}: ${d.commitMessage}`);
    add(300, "");
    add(0, `==> Building ${app.dockerfilePath}`);
    add(300, "#1 [internal] load build definition from Dockerfile");
    add(300, "#2 [internal] load metadata for docker.io/library/node:22-alpine");
    add(500, "#3 [1/6] FROM docker.io/library/node:22-alpine@sha256:4f2a1c9e");
    add(500, "#4 [2/6] WORKDIR /app");
    add(400, "#5 [3/6] COPY package.json pnpm-lock.yaml ./");
    add(500, "#6 [4/6] RUN corepack enable && pnpm install --frozen-lockfile");
    add(900, "#6 Packages: +312");
    add(700, "#6 Done in 4.1s");
    add(400, "#7 [5/6] COPY . .");
    add(400, "#8 [6/6] RUN pnpm build");
    if (d.outcome === "failed") {
      add(
        1100,
        "#8 ERROR: src/routes/users.ts(42,7): Property 'role' does not exist on type 'User'.",
      );
      add(
        200,
        '#8 ERROR: process "/bin/sh -c pnpm build" did not complete successfully: exit code: 2',
      );
      add(300, "");
      add(0, "==> Failed: build failed (exit code 1). See the log for details.");
      return { lines, total: t + 200 };
    }
    add(1100, "#8 ✓ built in 2.31s");
    add(400, "#9 exporting to image");
    add(500, `#9 naming to docker.io/nocap/${app.id.slice(0, 8)}:${d.id.slice(0, 8)} done`);
  }
  add(300, "");
  add(0, `==> Starting the container on port ${app.port}`);
  add(
    200,
    domains.length
      ? `Domains: ${domains.map((h) => `https://${h}`).join(", ")}`
      : "No domain yet: add one in Domains to reach the app from the internet.",
  );
  add(200, `Environment variables: ${envCount}`);
  add(300, "");
  add(0, "==> Checking that the app stays up");
  add(2000, "");
  add(0, "==> Done. The app is live.");
  return { lines, total: t + 100 };
}

function scriptFor(state: DemoState, d: DemoDeployment): Script {
  const app = state.apps.find((a) => a.id === d.applicationId);
  if (!app) return { lines: [], total: 0 };
  const hosts = state.domains.filter((x) => x.applicationId === app.id).map((x) => x.hostname);
  return script(app, d, hosts, state.env[app.id]?.length ?? 0);
}

/** Moves every playing deployment forward to `now`. */
function advance(state: DemoState, now: number): void {
  for (const d of state.deployments) {
    if (d.status !== "queued" && d.status !== "building") continue;
    const started = new Date(d.startedAt ?? d.createdAt).getTime();
    if (now < started) continue;
    const { total } = scriptFor(state, d);
    if (now - started < total) {
      d.status = "building";
      continue;
    }
    d.status = d.outcome;
    d.finishedAt = new Date(started + total).toISOString();
    const app = state.apps.find((a) => a.id === d.applicationId);
    if (d.outcome === "running") {
      for (const other of state.deployments) {
        if (other !== d && other.applicationId === d.applicationId && other.status === "running") {
          other.status = "superseded";
        }
      }
      if (app) app.status = "running";
    } else {
      d.error = "build failed (exit code 1). See the log for details.";
      if (app) {
        const live = state.deployments.some(
          (o) => o.applicationId === app.id && o.status === "running",
        );
        app.status = live ? "running" : "failed";
      }
    }
  }
}

function logText(
  state: DemoState,
  d: DemoDeployment,
  now: number,
): { text: string; done: boolean } {
  const { lines, total } = scriptFor(state, d);
  const started = new Date(d.startedAt ?? d.createdAt).getTime();
  const finished = d.status !== "queued" && d.status !== "building";
  const elapsed = finished ? Infinity : now - started;
  const text = lines
    .filter(([at]) => at <= elapsed)
    .map(([, line]) => `${line}\n`)
    .join("");
  return { text, done: finished || elapsed >= total };
}

// ---------------------------------------------------------------- views

function toDeployment(state: DemoState, d: DemoDeployment): Deployment {
  const app = state.apps.find((a) => a.id === d.applicationId);
  return {
    id: d.id,
    applicationId: d.applicationId,
    applicationName: app?.name ?? "App",
    projectId: app?.projectId ?? "",
    status: d.status,
    trigger: d.trigger,
    commitSha: d.commitSha,
    commitMessage: d.commitMessage,
    imageTag: d.imageTag,
    error: d.error,
    startedAt: d.startedAt,
    finishedAt: d.finishedAt,
    createdAt: d.createdAt,
  };
}

const newest = <T extends { createdAt: string }>(list: T[]) =>
  [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

function toApplication(state: DemoState, app: DemoApp): Application {
  const last = newest(state.deployments.filter((d) => d.applicationId === app.id))[0];
  return {
    ...app,
    projectName: state.projects.find((p) => p.id === app.projectId)?.name ?? "",
    domains: state.domains.filter((d) => d.applicationId === app.id).map((d) => d.hostname),
    lastDeployment: last ? toDeployment(state, last) : null,
  };
}

function toProject(state: DemoState, project: DemoProject): Project {
  return {
    ...project,
    applicationCount: state.apps.filter((a) => a.projectId === project.id).length,
  };
}

function overview(state: DemoState, now: number): Overview {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const wobble = (Math.sin(now / 9000) + 1) / 2;
  const running = state.apps.filter((a) => a.status === "running").length;
  return {
    counts: {
      projects: state.projects.length,
      applications: state.apps.length,
      running,
      failed: state.apps.filter((a) => a.status === "failed").length,
    },
    deploymentsToday: state.deployments.filter((d) => new Date(d.createdAt) >= today).length,
    recentDeployments: newest(state.deployments)
      .slice(0, 8)
      .map((d) => toDeployment(state, d)),
    server: {
      hostname: "demo-server",
      platform: "Linux 6.8.0-49-generic",
      cpus: 4,
      load: 0.16 + wobble * 0.14,
      memory: { total: 8 * 1024 ** 3, used: (3.1 + wobble * 0.4) * 1024 ** 3 },
      disk: { total: 80 * 1024 ** 3, used: 31.4 * 1024 ** 3 },
      uptime: 23 * 86400 + 4 * 3600,
    },
    docker: { available: true, version: "27.3.1", containersRunning: running + 3 },
  };
}

function containerLogs(app: DemoApp, now: number): string {
  const paths = [
    "/",
    "/health",
    "/api/v1/orders",
    "/api/v1/users/me",
    "/static/app.js",
    "/api/v1/search?q=report",
  ];
  const lines = [
    `${new Date(now - 3600_000).toISOString()} Listening on 0.0.0.0:${app.port}`,
    `${new Date(now - 3599_000).toISOString()} Connected to the database`,
  ];
  for (let i = 40; i >= 0; i -= 1) {
    const at = now - i * 47_000;
    const path = paths[(i * 7) % paths.length];
    const ms = 3 + ((i * 13) % 40);
    lines.push(`${new Date(at).toISOString()} GET ${path} ${i % 17 === 0 ? 404 : 200} ${ms}ms`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- router

/** Answers one API call against `state`, changing it in place like the real server would. */
export function handle(
  state: DemoState,
  method: string,
  fullPath: string,
  body: Body,
  now = Date.now(),
): DemoResponse {
  const [path = "", queryString = ""] = fullPath.split("?");
  const query = new URLSearchParams(queryString);
  const route = `${method} ${path}`;
  advance(state, now);

  if (route === "GET /api/health") return ok({ status: "ok", version: "demo" });
  if (route === "GET /api/setup/status") return ok({ needsSetup: false });
  if (route === "POST /api/setup") return fail(409, "Setup is already done. Sign in instead.");

  if (route === "POST /api/auth/login") {
    const email = String(body?.email ?? "").trim();
    const password = String(body?.password ?? "");
    const fields: Record<string, string> = {};
    if (!email) fields.email = "Enter any email address";
    if (!password) fields.password = "Enter any password";
    if (Object.keys(fields).length) return fail(400, "Check the highlighted fields", fields);
    state.signedIn = true;
    return ok({ user: DEMO_USER });
  }

  if (!state.signedIn) return fail(401, "Sign in to continue");

  if (route === "GET /api/auth/me") return ok({ user: DEMO_USER });
  if (route === "POST /api/auth/logout") {
    state.signedIn = false;
    return ok(undefined, 204);
  }

  if (route === "GET /api/overview") return ok(overview(state, now));

  // ---- settings and Git accounts
  if (route === "GET /api/settings" || route === "PATCH /api/settings") {
    if (method === "PATCH") {
      const value = String(body?.panelUrl ?? "")
        .trim()
        .replace(/\/+$/, "");
      if (value && !/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(value)) {
        return fail(400, "Check the highlighted fields", {
          panelUrl: "Use a full address, like https://panel.example.com",
        });
      }
      state.panelUrl = value || null;
    }
    return ok({
      settings: {
        panelUrl: state.panelUrl,
        version: "demo",
        secretConfigured: true,
        dockerNetwork: "nocapcloud",
      },
    });
  }
  if (route === "GET /api/git-providers") return ok({ providers: state.providers });
  if (route === "POST /api/git-providers/github/manifest") {
    // The real panel goes to GitHub here. The demo adds a sample account instead.
    if (!state.providers.some((p) => p.id === DEMO_GITHUB.id)) state.providers.unshift(DEMO_GITHUB);
    return ok({ action: "#", manifest: "{}" });
  }
  if (route === "POST /api/git-providers/gitlab") {
    const token = String(body?.token ?? "");
    if (token.length < 10) {
      return fail(400, "Check the highlighted fields", { token: "Paste a personal access token" });
    }
    const provider: GitProvider = {
      id: newId(),
      type: "gitlab",
      name: "GitLab · demo-team",
      url: String(body?.baseUrl ?? "https://gitlab.com"),
      installed: true,
      installUrl: null,
      createdAt: new Date(now).toISOString(),
    };
    state.providers.push(provider);
    return ok({ provider }, 201);
  }
  const m0 = /^\/api\/git-providers\/([^/]+)(?:\/(repos|branches))?$/.exec(path);
  if (m0) {
    const provider = state.providers.find((p) => p.id === m0?.[1]);
    if (!provider) return fail(404, "Git account not found");
    if (method === "DELETE" && !m0[2]) {
      state.providers = state.providers.filter((p) => p.id !== provider.id);
      for (const app of state.apps) {
        if (app.gitProvider?.id === provider.id) app.gitProvider = null;
      }
      return ok(undefined, 204);
    }
    if (m0[2] === "repos") {
      const repos =
        DEMO_REPOS[provider.id] ??
        [
          ["demo-team/api", true],
          ["demo-team/web", true],
        ].map(([fullName, isPrivate]) => ({
          fullName: String(fullName),
          url: `${provider.url}/${fullName}.git`,
          private: Boolean(isPrivate),
          defaultBranch: "main",
          updatedAt: new Date(now - 7200_000).toISOString(),
        }));
      return ok({ repos });
    }
    if (m0[2] === "branches") return ok({ branches: ["main", "staging", "develop"] });
  }

  // ---- projects
  if (route === "GET /api/projects") {
    return ok({ projects: newest(state.projects).map((p) => toProject(state, p)) });
  }
  if (route === "POST /api/projects") {
    const { fields, result } = readProjectInput(body, false);
    if (Object.keys(fields).length) return fail(400, "Check the highlighted fields", fields);
    const stamp = new Date(now).toISOString();
    const project: DemoProject = {
      id: newId(),
      name: result.name ?? "",
      description: result.description ?? null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    state.projects.push(project);
    return ok({ project: toProject(state, project) }, 201);
  }

  let m = /^\/api\/projects\/([^/]+)(\/applications)?$/.exec(path);
  if (m) {
    const project = state.projects.find((p) => p.id === m?.[1]);
    if (!project) return fail(404, "Project not found");
    if (m[2]) {
      if (method === "GET") {
        const list = newest(state.apps.filter((a) => a.projectId === project.id));
        return ok({ applications: list.map((a) => toApplication(state, a)) });
      }
      if (method === "POST") {
        const input = parse(applicationInputSchema, body);
        if (isResponse(input)) return input;
        const stamp = new Date(now).toISOString();
        const provider =
          input.source === "git" && input.gitProviderId
            ? state.providers.find((p) => p.id === input.gitProviderId)
            : undefined;
        if (input.source === "git" && input.gitProviderId && !provider) {
          return fail(404, "Git account not found");
        }
        const id = newId();
        const app: DemoApp = {
          id,
          projectId: project.id,
          name: input.name,
          source: input.source,
          repoUrl: input.source === "git" ? input.repoUrl : null,
          gitProvider: provider
            ? { id: provider.id, type: provider.type, name: provider.name }
            : null,
          autoDeploy: input.source === "git" && Boolean(provider) && input.autoDeploy,
          deployToken: id.replaceAll("-", "").repeat(2),
          branch: input.source === "git" ? input.branch : "main",
          dockerfilePath: input.source === "git" ? input.dockerfilePath : "Dockerfile",
          image: input.source === "image" ? input.image : null,
          port: input.port,
          status: "idle",
          createdAt: stamp,
          updatedAt: stamp,
        };
        state.apps.push(app);
        return ok({ application: toApplication(state, app) }, 201);
      }
    }
    if (method === "GET") return ok({ project: toProject(state, project) });
    if (method === "PATCH") {
      const { fields, result } = readProjectInput(body, true);
      if (Object.keys(fields).length) return fail(400, "Check the highlighted fields", fields);
      Object.assign(project, result, { updatedAt: new Date(now).toISOString() });
      return ok({ project: toProject(state, project) });
    }
    if (method === "DELETE") {
      const ids = new Set(state.apps.filter((a) => a.projectId === project.id).map((a) => a.id));
      state.projects = state.projects.filter((p) => p.id !== project.id);
      state.apps = state.apps.filter((a) => !ids.has(a.id));
      state.deployments = state.deployments.filter((d) => !ids.has(d.applicationId));
      state.domains = state.domains.filter((d) => !ids.has(d.applicationId));
      return ok(undefined, 204);
    }
  }

  // ---- applications
  if (route === "GET /api/applications") {
    return ok({ applications: newest(state.apps).map((a) => toApplication(state, a)) });
  }

  m = /^\/api\/applications\/([^/]+)(?:\/(.+))?$/.exec(path);
  if (m) {
    const app = state.apps.find((a) => a.id === m?.[1]);
    if (!app) return fail(404, "Application not found");
    const sub = m[2] ?? "";

    if (sub === "" && method === "GET") return ok({ application: toApplication(state, app) });
    if (sub === "" && method === "PATCH") {
      const input = parse(applicationUpdateSchema, body);
      if (isResponse(input)) return input;
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) Object.assign(app, { [key]: value });
      }
      app.updatedAt = new Date(now).toISOString();
      return ok({ application: toApplication(state, app) });
    }
    if (sub === "" && method === "DELETE") {
      if (app.status === "building") {
        return fail(409, "Wait for the deployment to finish before deleting the app.");
      }
      state.apps = state.apps.filter((a) => a.id !== app.id);
      state.deployments = state.deployments.filter((d) => d.applicationId !== app.id);
      state.domains = state.domains.filter((d) => d.applicationId !== app.id);
      return ok(undefined, 204);
    }

    if (sub === "deploy" && method === "POST") {
      if (app.status === "building") {
        return fail(409, "A deployment of this app is already in progress.");
      }
      const previous = state.deployments.some((d) => d.applicationId === app.id);
      const count = state.deployments.length + 1;
      const deployment: DemoDeployment = {
        id: newId(),
        applicationId: app.id,
        status: "queued",
        // The sample admin console keeps failing until its settings change, to show a failed build.
        outcome:
          app.id.endsWith("000000000003") && app.updatedAt === app.createdAt ? "failed" : "running",
        trigger: previous ? "redeploy" : "manual",
        commitSha: app.source === "git" ? sha(count + 11) : null,
        commitMessage: app.source === "git" ? (COMMITS[count % COMMITS.length] ?? null) : null,
        imageTag:
          app.source === "image"
            ? app.image
            : `nocap/${app.id.slice(0, 8)}:${String(count).padStart(8, "0")}`,
        error: null,
        startedAt: new Date(now + 800).toISOString(),
        finishedAt: null,
        createdAt: new Date(now).toISOString(),
      };
      state.deployments.push(deployment);
      app.status = "building";
      return ok({ deployment: toDeployment(state, deployment) }, 202);
    }

    if (sub === "deploy-token" && method === "POST") {
      app.deployToken = newId().replaceAll("-", "").repeat(2);
      return ok({ deployToken: app.deployToken });
    }

    if (sub === "deployments" && method === "GET") {
      const list = newest(state.deployments.filter((d) => d.applicationId === app.id));
      return ok({ deployments: list.map((d) => toDeployment(state, d)) });
    }

    const action = /^actions\/(start|stop|restart)$/.exec(sub)?.[1];
    if (action && method === "POST") {
      if (!state.deployments.some((d) => d.applicationId === app.id && d.status === "running")) {
        return fail(409, "Deploy the app first.");
      }
      app.status = action === "stop" ? "stopped" : "running";
      return ok({ application: toApplication(state, app) });
    }
    if (sub.startsWith("actions/")) return fail(404, "Unknown action");

    if (sub === "logs" && method === "GET") {
      const live = app.status === "running";
      const deployed = state.deployments.some(
        (d) => d.applicationId === app.id && d.status === "running",
      );
      return ok({ logs: deployed ? containerLogs(app, now) : "", running: live });
    }

    if (sub === "domains" && method === "GET") {
      return ok({ domains: state.domains.filter((d) => d.applicationId === app.id) });
    }
    if (sub === "domains" && method === "POST") {
      const input = parse(domainInputSchema, body);
      if (isResponse(input)) return input;
      if (state.domains.some((d) => d.hostname === input.hostname)) {
        return fail(400, "Check the highlighted fields", {
          hostname: "This domain is already used by an app",
        });
      }
      const domain: Domain = {
        id: newId(),
        applicationId: app.id,
        hostname: input.hostname,
        https: true,
        createdAt: new Date(now).toISOString(),
      };
      state.domains.push(domain);
      return ok({ domain }, 201);
    }

    if (sub === "env" && method === "GET") return ok({ vars: state.env[app.id] ?? [] });
    if (sub === "env" && method === "PUT") {
      const input = parse(envVarsSchema, body);
      if (isResponse(input)) return input;
      state.env[app.id] = [...input.vars].sort((a, b) => a.key.localeCompare(b.key));
      return ok({ vars: input.vars });
    }
  }

  m = /^\/api\/domains\/([^/]+)$/.exec(path);
  if (m && method === "DELETE") {
    const before = state.domains.length;
    state.domains = state.domains.filter((d) => d.id !== m?.[1]);
    return state.domains.length < before ? ok(undefined, 204) : fail(404, "Domain not found");
  }

  // ---- deployments
  if (route === "GET /api/deployments") {
    const limit = Math.min(Number(query.get("limit")) || 30, 100);
    return ok({
      deployments: newest(state.deployments)
        .slice(0, limit)
        .map((d) => toDeployment(state, d)),
    });
  }
  m = /^\/api\/deployments\/([^/]+)(\/logs)?$/.exec(path);
  if (m && method === "GET") {
    const d = state.deployments.find((x) => x.id === m?.[1]);
    if (!d) return fail(404, "Deployment not found");
    if (!m[2]) return ok({ deployment: toDeployment(state, d) });
    const offset = Number(query.get("offset")) || 0;
    const { text, done } = logText(state, d, now);
    return ok({ text: text.slice(offset), next: Math.max(offset, text.length), done });
  }

  return fail(404, "Not found");
}

let state: DemoState | undefined;

/** The demo version of one API call: loads the saved state, answers, saves. */
export async function demoRequest(
  method: string,
  path: string,
  body: unknown,
): Promise<DemoResponse> {
  state ??= loadState();
  // A short pause, so loading states show like they do against a real server.
  await new Promise((resolve) => setTimeout(resolve, 120));
  const response = handle(state, method, path, body as Body);
  saveState(state);
  return response;
}
