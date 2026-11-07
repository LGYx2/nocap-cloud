import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Application, ManagedDatabase } from "@nocap/shared";
import { parseSize, parseStats } from "../src/runtime";
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

async function createDatabase(extra: object = {}): Promise<ManagedDatabase> {
  const res = await call("POST", `/api/projects/${projectId}/databases`, {
    name: "Main",
    engine: "postgres",
    ...extra,
  });
  expect(res.statusCode, res.body).toBe(201);
  await t.databases.idle();
  return (await call("GET", `/api/databases/${res.json().database.id}`)).json().database;
}

async function createApp(): Promise<Application> {
  const res = await call("POST", `/api/projects/${projectId}/applications`, {
    source: "git",
    name: "Storefront",
    repoUrl: "https://github.com/acme/storefront.git",
  });
  return res.json().application;
}

async function deploy(appId: string) {
  const res = await call("POST", `/api/applications/${appId}/deploy`);
  expect(res.statusCode).toBe(202);
  await t.deployer.idle();
  const id = res.json().deployment.id;
  const deployment = (await call("GET", `/api/deployments/${id}`)).json().deployment;
  const log = (await call("GET", `/api/deployments/${id}/logs`)).json().text as string;
  return { deployment, log };
}

describe("databases", () => {
  it("starts a Postgres database with a volume and a generated password", async () => {
    const database = await createDatabase();
    expect(database).toMatchObject({
      name: "Main",
      engine: "postgres",
      version: "17-alpine",
      status: "running",
      port: 5432,
      dbName: "app",
      username: "nocap",
      links: [],
    });
    expect(database.host).toMatch(/^nocap-db-[0-9a-f]{8}$/);
    expect(database).not.toHaveProperty("password");
    expect(database).not.toHaveProperty("passwordEnc");

    const [container] = t.runtime.databaseList;
    expect(container?.options).toMatchObject({
      image: "postgres:17-alpine",
      dataPath: "/var/lib/postgresql/data",
      name: database.host,
    });
    expect(container?.options.env.POSTGRES_PASSWORD).toHaveLength(32);

    const connection = (await call("GET", `/api/databases/${database.id}/connection`)).json();
    expect(connection.password).toBe(container?.options.env.POSTGRES_PASSWORD);
    expect(connection.url).toBe(
      `postgresql://nocap:${connection.password}@${database.host}:5432/app`,
    );

    const project = (await call("GET", `/api/projects/${projectId}`)).json().project;
    expect(project.databaseCount).toBe(1);
  });

  it("runs Redis with the password from the environment, not the command line", async () => {
    const database = await createDatabase({ name: "Cache", engine: "redis" });
    const options = t.runtime.databaseList[0]?.options;
    expect(options?.image).toBe("redis:7-alpine");
    expect(options?.command?.join(" ")).toContain('"$REDIS_PASSWORD"');
    expect(options?.command?.join(" ")).not.toContain(options?.env.REDIS_PASSWORD);
    const connection = (await call("GET", `/api/databases/${database.id}/connection`)).json();
    expect(connection.url).toMatch(/^redis:\/\/default:.+@nocap-db-[0-9a-f]{8}:6379\/0$/);
  });

  it("rejects unknown engines, versions and database names", async () => {
    const bad = [
      { engine: "oracle" },
      { engine: "postgres", version: "9; rm -rf /" },
      { engine: "mysql", dbName: "app; drop" },
    ];
    for (const extra of bad) {
      const res = await call("POST", `/api/projects/${projectId}/databases`, {
        name: "x",
        ...extra,
      });
      expect(res.statusCode, JSON.stringify(extra)).toBe(400);
    }
  });

  it("marks a database failed when it cannot start, and starts it again on request", async () => {
    t.runtime.failDatabase = true;
    const database = await createDatabase({ engine: "mysql" });
    expect(database.status).toBe("failed");
    expect(database.error).toContain("manifest unknown");

    const res = await call("POST", `/api/databases/${database.id}/actions/start`);
    expect(res.statusCode).toBe(200);
    await t.databases.idle();
    const again = (await call("GET", `/api/databases/${database.id}`)).json().database;
    expect(again.status).toBe("running");
    expect(again.error).toBeNull();
  });

  it("stops and starts a running database", async () => {
    const database = await createDatabase();
    const stopped = await call("POST", `/api/databases/${database.id}/actions/stop`);
    expect(stopped.json().database.status).toBe("stopped");
    expect(t.runtime.databaseList[0]?.running).toBe(false);
    const started = await call("POST", `/api/databases/${database.id}/actions/start`);
    expect(started.json().database.status).toBe("running");
  });

  it("links a database to an app, which gets the URL on deploy", async () => {
    const database = await createDatabase();
    const app = await createApp();
    const linked = await call("POST", `/api/databases/${database.id}/links`, {
      applicationId: app.id,
    });
    expect(linked.statusCode).toBe(201);
    expect(linked.json().database.links).toMatchObject([
      { applicationId: app.id, applicationName: "Storefront", variable: "DATABASE_URL" },
    ]);

    const env = (await call("GET", `/api/applications/${app.id}/env`)).json();
    expect(env.vars).toEqual([]);
    expect(env.linked).toMatchObject([{ variable: "DATABASE_URL", databaseName: "Main" }]);
    expect(JSON.stringify(env)).not.toContain("postgresql://");

    const { deployment, log } = await deploy(app.id);
    expect(deployment.status).toBe("running");
    const connection = (await call("GET", `/api/databases/${database.id}/connection`)).json();
    expect(t.runtime.runs[0]?.env.DATABASE_URL).toBe(connection.url);
    expect(log).toContain("Linked databases: DATABASE_URL");
    expect(log).not.toContain(connection.password);
  });

  it("refuses links that clash with the app's own variables or another link", async () => {
    const database = await createDatabase();
    const app = await createApp();
    await call("PUT", `/api/applications/${app.id}/env`, {
      vars: [{ key: "DATABASE_URL", value: "postgres://elsewhere" }],
    });
    const clash = await call("POST", `/api/databases/${database.id}/links`, {
      applicationId: app.id,
    });
    expect(clash.statusCode).toBe(400);
    expect(clash.json().fields.variable).toContain("already has DATABASE_URL");

    const ok = await call("POST", `/api/databases/${database.id}/links`, {
      applicationId: app.id,
      variable: "PRIMARY_DB",
    });
    expect(ok.statusCode).toBe(201);
    const again = await call("POST", `/api/databases/${database.id}/links`, {
      applicationId: app.id,
      variable: "PRIMARY_DB",
    });
    expect(again.statusCode).toBe(400);

    const save = await call("PUT", `/api/applications/${app.id}/env`, {
      vars: [{ key: "PRIMARY_DB", value: "x" }],
    });
    expect(save.statusCode).toBe(400);
  });

  it("only links apps from the same project", async () => {
    const database = await createDatabase();
    const other = (await call("POST", "/api/projects", { name: "Blog" })).json().project.id;
    const app = (
      await call("POST", `/api/projects/${other}/applications`, {
        source: "image",
        name: "Ghost",
        image: "ghost:5",
      })
    ).json().application;
    const res = await call("POST", `/api/databases/${database.id}/links`, {
      applicationId: app.id,
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses to delete a linked database, then deletes it with its data", async () => {
    const database = await createDatabase();
    const app = await createApp();
    const link = (
      await call("POST", `/api/databases/${database.id}/links`, { applicationId: app.id })
    ).json().database.links[0];

    const blocked = await call("DELETE", `/api/databases/${database.id}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toContain("Storefront");

    expect((await call("DELETE", `/api/database-links/${link.id}`)).statusCode).toBe(204);
    expect((await call("DELETE", `/api/databases/${database.id}`)).statusCode).toBe(204);
    expect(t.runtime.databaseList).toHaveLength(0);
    expect(t.runtime.volumes.size).toBe(0);
    expect((await call("GET", `/api/databases/${database.id}`)).statusCode).toBe(404);
  });

  it("keeps the volume when asked", async () => {
    const database = await createDatabase();
    await call("DELETE", `/api/databases/${database.id}?keepData=true`);
    expect(t.runtime.volumes.size).toBe(1);
  });

  it("removes databases and their data when the project is deleted", async () => {
    await createDatabase();
    expect((await call("DELETE", `/api/projects/${projectId}`)).statusCode).toBe(204);
    expect(t.runtime.databaseList).toHaveLength(0);
    expect(t.runtime.volumes.size).toBe(0);
  });

  it("reports CPU and memory per service", async () => {
    const database = await createDatabase();
    const res = (await call("GET", `/api/projects/${projectId}/usage`)).json();
    expect(res.available).toBe(true);
    expect(res.usage[database.id]).toEqual({ cpu: 1.5, memory: 64 * 1024 * 1024 });
  });

  it("needs a session", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/databases" });
    expect(res.statusCode).toBe(401);
  });
});

describe("release command", () => {
  it("runs before the new container starts", async () => {
    const app = await createApp();
    const patched = await call("PATCH", `/api/applications/${app.id}`, {
      releaseCommand: "npx prisma migrate deploy",
    });
    expect(patched.json().application.releaseCommand).toBe("npx prisma migrate deploy");

    const { deployment, log } = await deploy(app.id);
    expect(deployment.status).toBe("running");
    expect(t.runtime.releases[0]).toMatchObject({
      command: "npx prisma migrate deploy",
      image: t.runtime.runs[0]?.image,
    });
    expect(log.indexOf("release command")).toBeLessThan(log.indexOf("Starting the container"));
  });

  it("keeps the old version when it fails", async () => {
    const app = await createApp();
    await deploy(app.id);
    await call("PATCH", `/api/applications/${app.id}`, { releaseCommand: "bin/rails db:migrate" });
    t.runtime.failRelease = true;
    const { deployment } = await deploy(app.id);
    expect(deployment.status).toBe("failed");
    expect(deployment.error).toContain("release command failed");
    expect(t.runtime.runs).toHaveLength(1);
    expect(t.runtime.containerList).toHaveLength(1);
    const current = (await call("GET", `/api/applications/${app.id}`)).json().application;
    expect(current.status).toBe("running");
  });

  it("clears with an empty value and refuses multi-line commands", async () => {
    const app = await createApp();
    await call("PATCH", `/api/applications/${app.id}`, { releaseCommand: "alembic upgrade head" });
    const cleared = await call("PATCH", `/api/applications/${app.id}`, { releaseCommand: "" });
    expect(cleared.json().application.releaseCommand).toBeNull();
    const bad = await call("PATCH", `/api/applications/${app.id}`, {
      releaseCommand: "one\ntwo",
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("docker stats parsing", () => {
  it("reads sizes and percentages", () => {
    expect(parseSize("45.5MiB")).toBe(Math.round(45.5 * 1024 * 1024));
    expect(parseSize("1.2GB")).toBe(1.2e9);
    expect(parseSize("12kB")).toBe(12_000);
    expect(parseSize("nonsense")).toBe(0);
    expect(parseStats("nocap-db-1a2b3c4d\t12.50%\t45.5MiB / 7.6GiB\n")).toEqual([
      { name: "nocap-db-1a2b3c4d", cpu: 12.5, memory: Math.round(45.5 * 1024 * 1024) },
    ]);
  });
});
