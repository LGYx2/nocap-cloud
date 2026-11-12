import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stackFromImage, type Application, type MonitoringOverview } from "@nocap/shared";
import { detectStack } from "../src/detect";
import { short } from "../src/runtime";
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

function call(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object) {
  return t.app.inject({ method, url, payload, headers: { cookie } });
}

async function deployedApp(): Promise<Application> {
  const app = (
    await call("POST", `/api/projects/${projectId}/applications`, {
      source: "image",
      name: "Docs",
      image: "nginx:alpine",
    })
  ).json().application;
  await call("POST", `/api/applications/${app.id}/deploy`);
  await t.deployer.idle();
  return app;
}

const overview = async (): Promise<MonitoringOverview> =>
  (await call("GET", "/api/monitoring")).json();

describe("monitoring", () => {
  it("records CPU and memory for the server, apps and databases", async () => {
    const app = await deployedApp();
    const created = await call("POST", `/api/projects/${projectId}/databases`, {
      name: "Main",
      engine: "postgres",
    });
    await t.databases.idle();
    await t.monitor.tick();

    const data = await overview();
    expect(data.server.points).toHaveLength(1);
    expect(data.server.points[0]).toMatchObject({ cpu: 25, memory: 3.2e9 });
    const service = data.services.find((s) => s.id === app.id);
    expect(service).toMatchObject({
      kind: "app",
      stack: "nginx",
      cpu: 2.5,
      memory: 128 * 1024 * 1024,
      uptime: 100,
      responseMs: 12,
    });
    expect(data.services.find((s) => s.id === created.json().database.id)).toMatchObject({
      kind: "database",
      engine: "postgres",
      cpu: 1.5,
    });

    const series = (await call("GET", `/api/monitoring/services/${app.id}?range=24h`)).json();
    expect(series.points).toHaveLength(1);
    expect(series.checks[0]).toMatchObject({ up: 1, ms: 12 });
    expect(series.uptime).toBe(100);
  });

  it("opens an incident after two failed checks and resolves it when the app answers", async () => {
    const app = await deployedApp();
    await call("PUT", "/api/monitoring/alerts", { webhookUrl: "https://hooks.example.com/T1/abc" });
    t.down.add(short(app.id));

    await t.monitor.tick();
    expect((await overview()).incidents).toHaveLength(0);
    await t.monitor.tick();
    let data = await overview();
    expect(data.incidents[0]).toMatchObject({
      kind: "app_down",
      targetId: app.id,
      title: "Docs is not answering",
      resolvedAt: null,
    });
    expect(t.alerts.at(-1)).toMatchObject({ state: "open", event: "app_down" });
    expect((await call("GET", "/api/overview")).json().counts.incidents).toBe(1);

    await t.monitor.tick();
    expect(t.alerts).toHaveLength(1); // no second alert for the same incident

    t.down.clear();
    await t.monitor.tick();
    data = await overview();
    expect(data.incidents[0]?.resolvedAt).not.toBeNull();
    expect(t.alerts.at(-1)).toMatchObject({ state: "resolved" });
    expect(String(t.alerts.at(-1)?.text)).toContain("Docs is answering again");
  });

  it("does not check apps that were stopped, and closes their incident", async () => {
    const app = await deployedApp();
    t.down.add(short(app.id));
    await t.monitor.tick();
    await t.monitor.tick();
    await call("POST", `/api/applications/${app.id}/actions/stop`);
    await t.monitor.tick();
    expect((await overview()).incidents[0]?.resolvedAt).not.toBeNull();
  });

  it("records failed deployments and a full disk", async () => {
    const app = (
      await call("POST", `/api/projects/${projectId}/applications`, {
        source: "git",
        name: "Storefront",
        repoUrl: "https://github.com/acme/storefront.git",
      })
    ).json().application;
    t.runtime.failBuild = true;
    await call("POST", `/api/applications/${app.id}/deploy`);
    await t.deployer.idle();
    t.server.disk = 0.95;
    await t.monitor.tick();

    const kinds = (await overview()).incidents.map((i) => i.kind).sort();
    expect(kinds).toEqual(["deploy_failed", "server_disk"]);
    await t.monitor.tick();
    expect((await overview()).incidents).toHaveLength(2); // neither is recorded twice

    t.server.disk = 0.5;
    await t.monitor.tick();
    const disk = (await overview()).incidents.find((i) => i.kind === "server_disk");
    expect(disk?.resolvedAt).not.toBeNull();
  });

  it("stores the alert webhook encrypted and never returns the address", async () => {
    const bad = await call("PUT", "/api/monitoring/alerts", { webhookUrl: "http://plain.example" });
    expect(bad.statusCode).toBe(400);
    expect((await call("POST", "/api/monitoring/alerts/test")).statusCode).toBe(409);

    const saved = await call("PUT", "/api/monitoring/alerts", {
      webhookUrl: "https://hooks.example.com/services/T1/secret-part",
    });
    expect(saved.json().alerts).toEqual({ webhookHost: "hooks.example.com" });
    expect(saved.body).not.toContain("secret-part");

    expect((await call("POST", "/api/monitoring/alerts/test")).statusCode).toBe(200);
    expect(String(t.alerts[0]?.content)).toContain("test alert");

    await call("PUT", "/api/monitoring/alerts", { webhookUrl: "" });
    expect((await call("GET", "/api/monitoring/alerts")).json().alerts.webhookHost).toBeNull();
  });

  it("needs a session", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/monitoring" })).statusCode).toBe(401);
  });
});

describe("stack detection", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "nocap-detect-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const file = (name: string, text: string) => writeFile(join(dir, name), text);

  it("reads frameworks from the usual project files", async () => {
    await file("package.json", JSON.stringify({ dependencies: { next: "15", react: "19" } }));
    expect(await detectStack(dir, "Dockerfile")).toBe("nextjs");
    await file("package.json", JSON.stringify({ dependencies: { fastify: "5" } }));
    expect(await detectStack(dir, "Dockerfile")).toBe("node");
  });

  it("recognises Python, Java and plain Dockerfiles", async () => {
    await file("requirements.txt", "fastapi==0.115\nuvicorn");
    expect(await detectStack(dir, "Dockerfile")).toBe("fastapi");
    await rm(join(dir, "requirements.txt"));
    await file("pom.xml", "<artifactId>spring-boot-starter-web</artifactId>");
    expect(await detectStack(dir, "Dockerfile")).toBe("spring");
    await rm(join(dir, "pom.xml"));
    await file("Dockerfile", "FROM golang:1.23 AS build\nFROM nginx:alpine\nCOPY . .");
    expect(await detectStack(dir, "Dockerfile")).toBe("nginx");
    await file("Dockerfile", "FROM scratch");
    expect(await detectStack(dir, "Dockerfile")).toBeNull();
  });

  it("reads the stack of ready-made images from their name", () => {
    expect(stackFromImage("grafana/grafana:11.3.0")).toBe("grafana");
    expect(stackFromImage("ghcr.io/acme/node-api:1")).toBe("node");
    expect(stackFromImage("registry.example.com/team/backend@sha256:abc")).toBe("docker");
  });
});
