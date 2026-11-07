import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { envVars } from "@nocap/db";
import type { Application, Deployment } from "@nocap/shared";
import { traefikLabels } from "../src/runtime";
import { admin, createTestApp, sessionCookie, type TestContext } from "./helpers";

let t: TestContext;
let cookie: string;
let projectId: string;

beforeEach(async () => {
  t = await createTestApp();
  const res = await t.app.inject({ method: "POST", url: "/api/setup", payload: admin });
  cookie = sessionCookie(res.headers["set-cookie"]);
  projectId = (await call("POST", "/api/projects", { name: "Shop" })).json().project.id;
});

afterEach(async () => {
  await t.close();
});

function call(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object) {
  return t.app.inject({ method, url, payload, headers: { cookie } });
}

async function createGitApp(extra: object = {}): Promise<Application> {
  const res = await call("POST", `/api/projects/${projectId}/applications`, {
    source: "git",
    name: "Storefront",
    repoUrl: "https://github.com/acme/storefront.git",
    ...extra,
  });
  expect(res.statusCode).toBe(201);
  return res.json().application;
}

async function deploy(appId: string): Promise<Deployment> {
  const res = await call("POST", `/api/applications/${appId}/deploy`);
  expect(res.statusCode).toBe(202);
  await t.deployer.idle();
  return (await call("GET", `/api/deployments/${res.json().deployment.id}`)).json().deployment;
}

describe("applications", () => {
  it("creates a Git app with defaults and lists it in the project", async () => {
    const app = await createGitApp();
    expect(app).toMatchObject({
      name: "Storefront",
      source: "git",
      branch: "main",
      dockerfilePath: "Dockerfile",
      port: 3000,
      status: "idle",
      projectName: "Shop",
      domains: [],
      lastDeployment: null,
    });
    const list = await call("GET", `/api/projects/${projectId}/applications`);
    expect(list.json().applications).toHaveLength(1);
    const project = await call("GET", `/api/projects/${projectId}`);
    expect(project.json().project.applicationCount).toBe(1);
  });

  it("creates an image app", async () => {
    const res = await call("POST", `/api/projects/${projectId}/applications`, {
      source: "image",
      name: "Docs",
      image: "nginx:alpine",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().application).toMatchObject({
      source: "image",
      image: "nginx:alpine",
      port: 80,
    });
  });

  it("rejects unsafe repository addresses, branches and paths", async () => {
    const bad = [
      { repoUrl: "file:///etc" },
      { repoUrl: "--upload-pack=touch /tmp/x" },
      { repoUrl: "https://github.com/a/b", branch: "--force" },
      { repoUrl: "https://github.com/a/b", dockerfilePath: "../../etc/passwd" },
    ];
    for (const extra of bad) {
      const res = await call("POST", `/api/projects/${projectId}/applications`, {
        source: "git",
        name: "x",
        ...extra,
      });
      expect(res.statusCode, JSON.stringify(extra)).toBe(400);
    }
  });

  it("updates and deletes an app, removing its containers", async () => {
    const app = await createGitApp();
    const patched = await call("PATCH", `/api/applications/${app.id}`, {
      branch: "release",
      port: 8080,
    });
    expect(patched.json().application).toMatchObject({ branch: "release", port: 8080 });

    await deploy(app.id);
    expect(t.runtime.containerList).toHaveLength(1);
    const res = await call("DELETE", `/api/applications/${app.id}`);
    expect(res.statusCode).toBe(204);
    expect(t.runtime.containerList).toHaveLength(0);
    expect((await call("GET", `/api/applications/${app.id}`)).statusCode).toBe(404);
  });
});

describe("deployments", () => {
  it("clones, builds and runs a Git app, then marks it running", async () => {
    const app = await createGitApp();
    await call("POST", `/api/applications/${app.id}/domains`, { hostname: "Shop.Example.com" });
    await call("PUT", `/api/applications/${app.id}/env`, {
      vars: [{ key: "DATABASE_URL", value: "postgres://x" }],
    });

    const deployment = await deploy(app.id);
    expect(deployment).toMatchObject({
      status: "running",
      trigger: "manual",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      commitMessage: "Add health check",
    });
    expect(t.runtime.calls[0]).toBe("clone https://github.com/acme/storefront.git main");
    const run = t.runtime.runs[0];
    expect(run?.env).toEqual({ DATABASE_URL: "postgres://x" });
    expect(run?.domains).toEqual(["shop.example.com"]);

    const current = (await call("GET", `/api/applications/${app.id}`)).json().application;
    expect(current.status).toBe("running");
    expect(current.lastDeployment.id).toBe(deployment.id);

    const log = (await call("GET", `/api/deployments/${deployment.id}/logs`)).json();
    expect(log.done).toBe(true);
    expect(log.text).toContain("==> Cloning https://github.com/acme/storefront.git (main)");
    expect(log.text).toContain("The app is live");
    expect(log.text).not.toContain("postgres://x");

    const more = (
      await call("GET", `/api/deployments/${deployment.id}/logs?offset=${log.next}`)
    ).json();
    expect(more.text).toBe("");
  });

  it("replaces the old container and marks the old deployment superseded", async () => {
    const app = await createGitApp();
    const first = await deploy(app.id);
    const second = await deploy(app.id);
    expect(second.trigger).toBe("redeploy");
    expect(t.runtime.containerList).toHaveLength(1);
    expect(t.runtime.containerList[0]?.deploymentId).toBe(second.id);
    const old = (await call("GET", `/api/deployments/${first.id}`)).json().deployment;
    expect(old.status).toBe("superseded");
  });

  it("keeps the old container serving when the new one crashes", async () => {
    const app = await createGitApp();
    await deploy(app.id);
    t.runtime.crashOnStart = true;
    const failed = await deploy(app.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("stopped right after it started");
    expect(t.runtime.containerList).toHaveLength(1);
    const current = (await call("GET", `/api/applications/${app.id}`)).json().application;
    expect(current.status).toBe("running");
  });

  it("marks the app failed when the first build fails", async () => {
    const app = await createGitApp();
    t.runtime.failBuild = true;
    const failed = await deploy(app.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("build failed");
    const current = (await call("GET", `/api/applications/${app.id}`)).json().application;
    expect(current.status).toBe("failed");
  });

  it("pulls image apps instead of building", async () => {
    const res = await call("POST", `/api/projects/${projectId}/applications`, {
      source: "image",
      name: "Docs",
      image: "nginx:alpine",
    });
    const deployment = await deploy(res.json().application.id);
    expect(deployment.status).toBe("running");
    expect(t.runtime.calls).toContain("pull nginx:alpine");
    expect(t.runtime.calls.some((c) => c.startsWith("build"))).toBe(false);
  });

  it("refuses a second deployment while one is in progress", async () => {
    const app = await createGitApp();
    const first = await call("POST", `/api/applications/${app.id}/deploy`);
    expect(first.statusCode).toBe(202);
    const second = await call("POST", `/api/applications/${app.id}/deploy`);
    expect(second.statusCode).toBe(409);
    await t.deployer.idle();
  });

  it("marks interrupted deployments failed after a restart", async () => {
    const app = await createGitApp();
    const res = await call("POST", `/api/applications/${app.id}/deploy`);
    await t.deployer.idle();
    // Pretend the server died mid-build.
    const { deployments } = await import("@nocap/db");
    await t.db
      .update(deployments)
      .set({ status: "building" })
      .where(eq(deployments.id, res.json().deployment.id));
    await t.deployer.recover();
    const after = (await call("GET", `/api/deployments/${res.json().deployment.id}`)).json();
    expect(after.deployment.status).toBe("failed");
  });

  it("lists recent deployments and the overview", async () => {
    const app = await createGitApp();
    await deploy(app.id);
    const list = (await call("GET", "/api/deployments")).json();
    expect(list.deployments[0]).toMatchObject({ applicationName: "Storefront", projectId });
    const overview = (await call("GET", "/api/overview")).json();
    expect(overview.counts).toEqual({ projects: 1, applications: 1, running: 1, failed: 0 });
    expect(overview.deploymentsToday).toBe(1);
    expect(overview.activity).toHaveLength(14);
    expect(overview.activity.at(-1)).toMatchObject({ total: 1, failed: 0 });
    expect(overview.docker.available).toBe(true);
    expect(overview.server.memory.total).toBeGreaterThan(0);
  });
});

describe("running apps", () => {
  it("stops, starts and restarts the app's container", async () => {
    const app = await createGitApp();
    expect((await call("POST", `/api/applications/${app.id}/actions/stop`)).statusCode).toBe(409);
    await deploy(app.id);
    const stopped = await call("POST", `/api/applications/${app.id}/actions/stop`);
    expect(stopped.json().application.status).toBe("stopped");
    const started = await call("POST", `/api/applications/${app.id}/actions/start`);
    expect(started.json().application.status).toBe("running");
    expect((await call("POST", `/api/applications/${app.id}/actions/explode`)).statusCode).toBe(
      404,
    );
    const logs = (await call("GET", `/api/applications/${app.id}/logs`)).json();
    expect(logs.logs).toContain("listening on port 3000");
  });
});

describe("domains", () => {
  it("adds, validates, refuses duplicates and deletes", async () => {
    const app = await createGitApp();
    const added = await call("POST", `/api/applications/${app.id}/domains`, {
      hostname: "app.example.com",
    });
    expect(added.statusCode).toBe(201);
    expect(
      (await call("POST", `/api/applications/${app.id}/domains`, { hostname: "not a domain" }))
        .statusCode,
    ).toBe(400);
    const dup = await call("POST", `/api/applications/${app.id}/domains`, {
      hostname: "APP.example.com",
    });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().fields.hostname).toContain("already used");
    const list = (await call("GET", `/api/applications/${app.id}/domains`)).json();
    expect(list.domains).toHaveLength(1);
    expect((await call("DELETE", `/api/domains/${added.json().domain.id}`)).statusCode).toBe(204);
  });

  it("builds Traefik labels with HTTPS for every domain", () => {
    const labels = traefikLabels({
      appId: "11111111-2222-4333-8444-555555555555",
      deploymentId: "x",
      image: "i",
      port: 8080,
      env: {},
      domains: ["a.example.com", "b.example.com"],
      network: "nocapcloud",
    });
    expect(labels["traefik.http.routers.nocap-11111111.rule"]).toBe(
      "Host(`a.example.com`) || Host(`b.example.com`)",
    );
    expect(labels["traefik.http.routers.nocap-11111111.tls.certresolver"]).toBe("letsencrypt");
    expect(labels["traefik.http.services.nocap-11111111.loadbalancer.server.port"]).toBe("8080");
  });
});

describe("environment variables", () => {
  it("stores values encrypted and returns them to the panel", async () => {
    const app = await createGitApp();
    const res = await call("PUT", `/api/applications/${app.id}/env`, {
      vars: [
        { key: "API_KEY", value: "s3cret" },
        { key: "MULTI", value: "line one\nline two" },
      ],
    });
    expect(res.statusCode).toBe(200);
    const rows = await t.db.select().from(envVars);
    expect(
      rows.every((row) => row.valueEnc.startsWith("v1.") && !row.valueEnc.includes("s3cret")),
    ).toBe(true);
    const back = (await call("GET", `/api/applications/${app.id}/env`)).json();
    expect(back.vars).toEqual([
      { key: "API_KEY", value: "s3cret" },
      { key: "MULTI", value: "line one\nline two" },
    ]);
  });

  it("rejects bad names and duplicates", async () => {
    const app = await createGitApp();
    const bad = await call("PUT", `/api/applications/${app.id}/env`, {
      vars: [{ key: "1BAD", value: "" }],
    });
    expect(bad.statusCode).toBe(400);
    const dup = await call("PUT", `/api/applications/${app.id}/env`, {
      vars: [
        { key: "A", value: "1" },
        { key: "A", value: "2" },
      ],
    });
    expect(dup.statusCode).toBe(400);
  });
});
