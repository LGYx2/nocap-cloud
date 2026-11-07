import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, sessions, users } from "@nocap/db";
import { admin, createTestApp, sessionCookie, type TestContext } from "./helpers";

let t: TestContext;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.close();
});

async function setup() {
  return t.app.inject({ method: "POST", url: "/api/setup", payload: admin });
}

describe("health", () => {
  it("reports ok with the version", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", version: "test" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("first-run setup", () => {
  it("needs setup on a fresh install", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/setup/status" });
    expect(res.json()).toEqual({ needsSetup: true });
  });

  it("creates the admin, signs them in and stores only a password hash", async () => {
    const res = await setup();
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ email: admin.email, name: admin.name });

    const cookie = res.headers["set-cookie"];
    expect(String(cookie)).toMatch(/nocap_session=.+; .*HttpOnly/);
    expect(String(cookie)).toMatch(/SameSite=Lax/);

    const [stored] = await t.db.select().from(users);
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored?.passwordHash).not.toContain(admin.password);

    const status = await t.app.inject({ method: "GET", url: "/api/setup/status" });
    expect(status.json()).toEqual({ needsSetup: false });
  });

  it("normalises the email to lower case", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/setup",
      payload: { ...admin, email: "  Admin@Example.COM " },
    });
    expect(res.json().user.email).toBe("admin@example.com");
  });

  it("refuses a second setup", async () => {
    await setup();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/setup",
      payload: { ...admin, email: "other@example.com" },
    });
    expect(res.statusCode).toBe(409);
    expect(await t.db.select().from(users)).toHaveLength(1);
  });

  it("allows only one admin when two setups race", async () => {
    const [a, b] = await Promise.all([
      setup(),
      t.app.inject({
        method: "POST",
        url: "/api/setup",
        payload: { ...admin, email: "racer@example.com" },
      }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(await t.db.select().from(users)).toHaveLength(1);
  });

  it("returns field errors for invalid input", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/setup",
      payload: { name: "", email: "not-an-email", password: "short" },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(Object.keys(body.fields).sort()).toEqual(["email", "name", "password"]);
  });
});

describe("login and sessions", () => {
  beforeEach(async () => {
    await setup();
  });

  it("signs in with the right password", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email, password: admin.password },
    });
    expect(res.statusCode).toBe(200);
    const me = await t.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: sessionCookie(res.headers["set-cookie"]) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(admin.email);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrongPassword = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email, password: "wrong password here" },
    });
    const unknownEmail = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password: "wrong password here" },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());

    const failed = await t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "auth.login_failed"));
    expect(failed).toHaveLength(2);
  });

  it("stores a hash of the session token, not the token", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email, password: admin.password },
    });
    const token = sessionCookie(res.headers["set-cookie"]).split("=")[1];
    const rows = await t.db.select().from(sessions);
    expect(rows.some((row) => row.id === token)).toBe(false);
  });

  it("rejects /me without a session", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("ends the session on logout", async () => {
    const login = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email, password: admin.password },
    });
    const cookie = sessionCookie(login.headers["set-cookie"]);

    const logout = await t.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);

    const me = await t.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it("rejects an expired session", async () => {
    const login = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email, password: admin.password },
    });
    await t.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    const me = await t.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: sessionCookie(login.headers["set-cookie"]) },
    });
    expect(me.statusCode).toBe(401);
  });

  it("rate limits repeated login attempts", async () => {
    const attempt = () =>
      t.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: admin.email, password: "wrong password here" },
      });
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await attempt()).statusCode);
    expect(codes.slice(0, 10).every((code) => code === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe("unknown routes", () => {
  it("returns a JSON 404 for unknown API routes", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Not found" });
  });
});

describe("serving the panel", () => {
  it("serves index.html for panel pages and 404 for missing files", async () => {
    const { mkdtemp, writeFile, mkdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "nocap-public-"));
    await writeFile(join(dir, "index.html"), "<!doctype html><title>panel</title>");
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "assets", "app-abc123.js"), "console.log(1)");

    const panel = await createTestApp({ PUBLIC_DIR: dir });
    try {
      const page = await panel.app.inject({ method: "GET", url: "/login" });
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toContain("text/html");
      expect(page.headers["cache-control"]).toBe("no-cache");

      const asset = await panel.app.inject({ method: "GET", url: "/assets/app-abc123.js" });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers["cache-control"]).toContain("immutable");

      const missing = await panel.app.inject({ method: "GET", url: "/assets/gone-123.js" });
      expect(missing.statusCode).toBe(404);
    } finally {
      await panel.close();
    }
  });
});
