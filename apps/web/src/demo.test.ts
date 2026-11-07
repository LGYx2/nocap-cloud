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

  it("signs out and back in with any credentials", () => {
    const state = seedState(now);
    expect(handle(state, "POST", "/api/auth/logout", undefined, now).status).toBe(204);
    expect(handle(state, "GET", "/api/auth/me", undefined, now).status).toBe(401);
    const login = handle(state, "POST", "/api/auth/login", { email: "a@b.c", password: "x" }, now);
    expect(login.status).toBe(200);
    expect(handle(state, "GET", "/api/auth/me", undefined, now).status).toBe(200);
  });
});
