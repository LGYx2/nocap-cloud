import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applications, auditLogs } from "@nocap/db";
import { admin, createTestApp, sessionCookie, type TestContext } from "./helpers";

let t: TestContext;
let cookie: string;

beforeEach(async () => {
  t = await createTestApp();
  const res = await t.app.inject({ method: "POST", url: "/api/setup", payload: admin });
  cookie = sessionCookie(res.headers["set-cookie"]);
});

afterEach(async () => {
  await t.close();
});

function call(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) {
  return t.app.inject({ method, url, payload, headers: { cookie } });
}

async function create(name: string, description?: string) {
  const res = await call("POST", "/api/projects", { name, description });
  expect(res.statusCode).toBe(201);
  return res.json().project as { id: string; name: string; description: string | null };
}

describe("projects", () => {
  it("needs a session", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/projects" });
    expect(res.statusCode).toBe(401);
  });

  it("starts empty", async () => {
    const res = await call("GET", "/api/projects");
    expect(res.json()).toEqual({ projects: [] });
  });

  it("creates a project, trims input and stores an empty description as null", async () => {
    const project = await create("  Shop  ", "   ");
    expect(project).toMatchObject({ name: "Shop", description: null, applicationCount: 0 });

    const logged = await t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "project.created"));
    expect(logged).toHaveLength(1);
  });

  it("lists projects newest first with their application count", async () => {
    const first = await create("First");
    await create("Second", "The second one");
    await t.db.insert(applications).values({ projectId: first.id, name: "web" });

    const list = (await call("GET", "/api/projects")).json().projects;
    expect(list.map((p: { name: string }) => p.name)).toEqual(["Second", "First"]);
    expect(list[1].applicationCount).toBe(1);
  });

  it("validates the name", async () => {
    const res = await call("POST", "/api/projects", { name: "", description: "x" });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().fields)).toEqual(["name"]);

    const long = await call("POST", "/api/projects", { name: "x".repeat(61) });
    expect(long.statusCode).toBe(400);
  });

  it("gets, renames and clears the description", async () => {
    const project = await create("Old name", "Some text");
    const renamed = await call("PATCH", `/api/projects/${project.id}`, {
      name: "New name",
      description: "",
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().project).toMatchObject({ name: "New name", description: null });

    const fetched = await call("GET", `/api/projects/${project.id}`);
    expect(fetched.json().project.name).toBe("New name");
  });

  it("keeps the description when a patch only changes the name", async () => {
    const project = await create("Name", "Keep me");
    const res = await call("PATCH", `/api/projects/${project.id}`, { name: "Other" });
    expect(res.json().project.description).toBe("Keep me");
  });

  it("deletes a project and its applications", async () => {
    const project = await create("Doomed");
    await t.db.insert(applications).values({ projectId: project.id, name: "api" });

    const res = await call("DELETE", `/api/projects/${project.id}`);
    expect(res.statusCode).toBe(204);
    expect((await call("GET", `/api/projects/${project.id}`)).statusCode).toBe(404);
    expect(await t.db.select().from(applications)).toHaveLength(0);
  });

  it("returns 404 for unknown or malformed ids", async () => {
    expect((await call("GET", "/api/projects/not-a-uuid")).statusCode).toBe(404);
    const missing = await call("GET", "/api/projects/00000000-0000-4000-8000-000000000000");
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "Project not found" });
  });
});
