import { describe, expect, it } from "vitest";
import { handle, seedState } from "./demo";

const now = Date.parse("2026-11-07T12:00:00Z");

describe("demo API", () => {
  it("starts signed in with sample projects, newest first", () => {
    const state = seedState(now);
    const res = handle(state, "GET", "/api/projects", undefined, now);
    const names = (res.data as { projects: { name: string }[] }).projects.map((p) => p.name);
    expect(res.status).toBe(200);
    expect(names[0]).toBe("Meridian API");
    expect(names).toHaveLength(4);
  });

  it("creates, renames and deletes a project", () => {
    const state = seedState(now);
    const created = handle(
      state,
      "POST",
      "/api/projects",
      { name: "  Shop ", description: "" },
      now,
    );
    expect(created.status).toBe(201);
    const project = (created.data as { project: { id: string; name: string; description: null } })
      .project;
    expect(project).toMatchObject({ name: "Shop", description: null });
    expect(project.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const renamed = handle(state, "PATCH", `/api/projects/${project.id}`, { name: "Store" }, now);
    expect((renamed.data as { project: { name: string } }).project.name).toBe("Store");

    expect(handle(state, "DELETE", `/api/projects/${project.id}`, undefined, now).status).toBe(204);
    expect(handle(state, "GET", `/api/projects/${project.id}`, undefined, now).status).toBe(404);
  });

  it("validates like the real server", () => {
    const res = handle(seedState(now), "POST", "/api/projects", { name: "" }, now);
    expect(res.status).toBe(400);
    expect(Object.keys((res.data as { fields: object }).fields)).toEqual(["name"]);
  });

  it("plays a deployment back: building, then live, with a growing log", () => {
    const state = seedState(now);
    const projectId = state.projects[0]?.id ?? "";
    const created = handle(
      state,
      "POST",
      `/api/projects/${projectId}/applications`,
      { source: "git", name: "Shop", repoUrl: "https://github.com/acme/shop.git" },
      now,
    );
    expect(created.status).toBe(201);
    const appId = (created.data as { application: { id: string } }).application.id;

    const started = handle(state, "POST", `/api/applications/${appId}/deploy`, undefined, now);
    expect(started.status).toBe(202);
    const id = (started.data as { deployment: { id: string } }).deployment.id;
    expect(handle(state, "POST", `/api/applications/${appId}/deploy`, undefined, now).status).toBe(
      409,
    );

    const early = handle(
      state,
      "GET",
      `/api/deployments/${id}/logs?offset=0`,
      undefined,
      now + 3000,
    ).data as { text: string; next: number; done: boolean };
    expect(early.done).toBe(false);
    expect(early.text).toContain("==> Cloning https://github.com/acme/shop.git (main)");

    const late = handle(
      state,
      "GET",
      `/api/deployments/${id}/logs?offset=${early.next}`,
      undefined,
      now + 60_000,
    ).data as { text: string; done: boolean };
    expect(late.done).toBe(true);
    expect(late.text).toContain("The app is live");
    expect(late.text).not.toContain("==> Cloning");

    const app = handle(state, "GET", `/api/applications/${appId}`, undefined, now + 60_000)
      .data as {
      application: { status: string };
    };
    expect(app.application.status).toBe("running");
  });

  it("validates apps, domains and env vars with the server's rules", () => {
    const state = seedState(now);
    const appId = state.apps[0]?.id ?? "";
    const bad = handle(
      state,
      "POST",
      `/api/projects/${state.projects[0]?.id}/applications`,
      { source: "git", name: "x", repoUrl: "file:///etc" },
      now,
    );
    expect(bad.status).toBe(400);
    expect(
      handle(state, "POST", `/api/applications/${appId}/domains`, { hostname: "nope" }, now).status,
    ).toBe(400);
    const env = handle(
      state,
      "PUT",
      `/api/applications/${appId}/env`,
      { vars: [{ key: "A", value: "1" }] },
      now,
    );
    expect(env.status).toBe(200);
    const overview = handle(state, "GET", "/api/overview", undefined, now).data as {
      counts: { applications: number };
    };
    expect(overview.counts.applications).toBe(state.apps.length);
  });

  it("signs out and back in with any credentials", () => {
    const state = seedState(now);
    expect(handle(state, "POST", "/api/auth/logout", undefined, now).status).toBe(204);
    expect(handle(state, "GET", "/api/auth/me", undefined, now).status).toBe(401);
    const login = handle(state, "POST", "/api/auth/login", { email: "a@b.c", password: "x" }, now);
    expect(login.status).toBe(200);
    expect(handle(state, "GET", "/api/auth/me", undefined, now).status).toBe(200);
  });

  it("creates a database, starts it on a clock and links it to an app", () => {
    const state = seedState(now);
    const projectId = "a1111111-1111-4111-8111-111111111111";
    const created = handle(
      state,
      "POST",
      `/api/projects/${projectId}/databases`,
      { name: "Search", engine: "mongodb" },
      now,
    );
    expect(created.status).toBe(201);
    const db = (created.data as { database: { id: string; status: string } }).database;
    expect(db.status).toBe("starting");
    expect(db).not.toHaveProperty("password");

    const later = handle(state, "GET", `/api/databases/${db.id}`, undefined, now + 10_000);
    expect((later.data as { database: { status: string } }).database.status).toBe("running");

    const appId = "e1000000-0000-4000-8000-000000000003";
    const link = handle(
      state,
      "POST",
      `/api/databases/${db.id}/links`,
      { applicationId: appId },
      now,
    );
    expect(link.status).toBe(201);
    const env = handle(state, "GET", `/api/applications/${appId}/env`, undefined, now);
    expect((env.data as { linked: { variable: string }[] }).linked).toMatchObject([
      { variable: "MONGODB_URI" },
    ]);
    expect(handle(state, "DELETE", `/api/databases/${db.id}`, undefined, now).status).toBe(409);
  });
});
