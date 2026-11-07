// Demo mode: a fake API that runs in the browser, so the panel can be tried without a server.
// Built only when VITE_DEMO=true (`pnpm build:demo`); the normal build never includes this file.
import type { ApiError, Project, PublicUser } from "@nocap/shared";
import { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX } from "@nocap/shared/constants";

const STORAGE_KEY = "nocap-demo";

export const DEMO_USER: PublicUser = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Demo User",
  email: "demo@nocap.cloud",
};

export interface DemoState {
  signedIn: boolean;
  projects: Project[];
}

export interface DemoResponse {
  status: number;
  data: unknown;
}

function hoursAgo(hours: number, now: number): string {
  return new Date(now - hours * 3600_000).toISOString();
}

/** Sample projects a visitor sees on the first visit. */
export function seedState(now = Date.now()): DemoState {
  const project = (
    id: string,
    name: string,
    description: string | null,
    applicationCount: number,
    created: number,
    updated: number,
  ): Project => ({
    id,
    name,
    description,
    applicationCount,
    createdAt: hoursAgo(created, now),
    updatedAt: hoursAgo(updated, now),
  });
  return {
    signedIn: true,
    projects: [
      project(
        "a1111111-1111-4111-8111-111111111111",
        "Meridian API",
        "Public REST API, webhook workers and the admin console.",
        0,
        2,
        1,
      ),
      project(
        "b2222222-2222-4222-8222-222222222222",
        "Harbor Analytics",
        "Event ingestion pipeline and reporting dashboards.",
        0,
        30,
        5,
      ),
      project("c3333333-3333-4333-8333-333333333333", "Lumen Docs", null, 0, 24 * 9, 24 * 2),
      project(
        "d4444444-4444-4444-8444-444444444444",
        "Ops Toolkit",
        "Status page, uptime checks and internal dashboards.",
        0,
        24 * 40,
        24 * 20,
      ),
    ],
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

function saveState(state: DemoState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The demo still works for this page view.
  }
}

/** Forget the visitor's changes and start again from the sample data. */
export function resetDemo(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
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

/** Answers one API call against `state`, changing it in place like the real server would. */
export function handle(
  state: DemoState,
  method: string,
  path: string,
  body: Body,
  now = Date.now(),
): DemoResponse {
  const route = `${method} ${path}`;

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

  if (route === "GET /api/projects") {
    const projects = [...state.projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok({ projects });
  }

  if (route === "POST /api/projects") {
    const { fields, result } = readProjectInput(body, false);
    if (Object.keys(fields).length) return fail(400, "Check the highlighted fields", fields);
    const stamp = new Date(now).toISOString();
    const project: Project = {
      id: newId(),
      name: result.name ?? "",
      description: result.description ?? null,
      applicationCount: 0,
      createdAt: stamp,
      updatedAt: stamp,
    };
    state.projects.push(project);
    return ok({ project }, 201);
  }

  const match = /^\/api\/projects\/([^/]+)$/.exec(path);
  if (match) {
    const project = state.projects.find((p) => p.id === match[1]);
    if (!project) return fail(404, "Project not found");

    if (method === "GET") return ok({ project });
    if (method === "PATCH") {
      const { fields, result } = readProjectInput(body, true);
      if (Object.keys(fields).length) return fail(400, "Check the highlighted fields", fields);
      Object.assign(project, result, { updatedAt: new Date(now).toISOString() });
      return ok({ project });
    }
    if (method === "DELETE") {
      state.projects = state.projects.filter((p) => p.id !== project.id);
      return ok(undefined, 204);
    }
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
