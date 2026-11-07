import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitProviders } from "@nocap/db";
import type { Application, GitProvider } from "@nocap/shared";
import { githubAppJwt, repoFullName } from "../src/git";
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

function call(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) {
  return t.app.inject({ method, url, payload, headers: { cookie } });
}

/** Runs the GitHub App manifest flow against the fake GitHub and returns the new account. */
async function connectGithub(): Promise<GitProvider> {
  const start = await call("POST", "/api/git-providers/github/manifest", {
    panelUrl: "https://panel.example.com/",
  });
  expect(start.statusCode).toBe(200);
  const { action, manifest } = start.json() as { action: string; manifest: string };
  const state = new URL(action).searchParams.get("state");
  const parsed = JSON.parse(manifest);
  expect(parsed.default_permissions).toEqual({ contents: "read", metadata: "read" });
  expect(parsed.default_events).toEqual(["push"]);

  const done = await call(
    "GET",
    `/api/git-providers/github/callback?code=good-code&state=${state}`,
  );
  expect(done.statusCode).toBe(302);
  expect(done.headers.location).toMatch(
    /^https:\/\/github.com\/apps\/nocap-test\/installations\/new/,
  );
  const providers = (await call("GET", "/api/git-providers")).json().providers as GitProvider[];
  expect(providers).toHaveLength(1);
  return providers[0] as GitProvider;
}

function signedPush(secret: string, payload: object) {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return { body, signature };
}

describe("GitHub", () => {
  it("creates the GitHub App from a manifest and stores its keys encrypted", async () => {
    const provider = await connectGithub();
    expect(provider).toMatchObject({ type: "github", name: "GitHub · acme", installed: true });
    const [row] = await t.db.select().from(gitProviders);
    expect(row?.configEnc.startsWith("v1.")).toBe(true);
    expect(row?.configEnc).not.toContain("hook-secret");

    const settings = (await call("GET", "/api/settings")).json().settings;
    expect(settings.panelUrl).toBe("https://panel.example.com");
  });

  it("refuses an unknown or reused state", async () => {
    const res = await call("GET", "/api/git-providers/github/callback?code=good-code&state=nope");
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("/git?error=");
  });

  it("lists repositories and branches with an installation token", async () => {
    const provider = await connectGithub();
    const repos = (await call("GET", `/api/git-providers/${provider.id}/repos`)).json().repos;
    expect(repos.map((r: { fullName: string }) => r.fullName)).toEqual(["acme/shop", "acme/docs"]);
    const filtered = (
      await call("GET", `/api/git-providers/${provider.id}/repos?search=doc`)
    ).json();
    expect(filtered.repos).toHaveLength(1);
    const branches = (
      await call("GET", `/api/git-providers/${provider.id}/branches?repo=acme/shop`)
    ).json().branches;
    expect(branches).toEqual(["main", "staging"]);
    const tokenCall = t.gitCalls.find((c) => c.url.includes("/installation/repositories"));
    expect(tokenCall?.auth).toBe("Bearer ghs_installtoken123");
  });

  it("clones private repositories with a token that never reaches the log", async () => {
    const provider = await connectGithub();
    const created = await call("POST", `/api/projects/${projectId}/applications`, {
      source: "git",
      name: "Shop",
      repoUrl: "https://github.com/acme/shop.git",
      gitProviderId: provider.id,
    });
    expect(created.statusCode).toBe(201);
    const app = created.json().application as Application;
    expect(app.gitProvider).toMatchObject({ id: provider.id, type: "github" });

    const res = await call("POST", `/api/applications/${app.id}/deploy`);
    await t.deployer.idle();
    expect(t.runtime.calls[0]).toBe(
      "clone https://x-access-token:ghs_installtoken123@github.com/acme/shop.git main",
    );
    const log = (await call("GET", `/api/deployments/${res.json().deployment.id}/logs`)).json();
    expect(log.text).toContain("Using the connected Git account");
    expect(log.text).not.toContain("ghs_installtoken123");
  });

  it("deploys matching apps when a signed push arrives", async () => {
    const provider = await connectGithub();
    const make = (branch: string, autoDeploy = true) =>
      call("POST", `/api/projects/${projectId}/applications`, {
        source: "git",
        name: `Shop ${branch}`,
        repoUrl: "https://github.com/acme/shop.git",
        gitProviderId: provider.id,
        branch,
        autoDeploy,
      });
    await make("main");
    await make("staging");
    await make("main", false);

    const push = signedPush("hook-secret", {
      ref: "refs/heads/main",
      repository: { full_name: "Acme/Shop" },
    });
    const res = await t.app.inject({
      method: "POST",
      url: `/api/webhooks/github/${provider.id}`,
      payload: push.body,
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-hub-signature-256": push.signature,
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().queued).toBe(1);
    await t.deployer.idle();
    const list = (await call("GET", "/api/deployments")).json().deployments;
    expect(list).toHaveLength(1);
    expect(list[0].trigger).toBe("push");
  });

  it("rejects pushes with a bad signature", async () => {
    const provider = await connectGithub();
    const push = signedPush("wrong-secret", { ref: "refs/heads/main" });
    const res = await t.app.inject({
      method: "POST",
      url: `/api/webhooks/github/${provider.id}`,
      payload: push.body,
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-hub-signature-256": push.signature,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("signs app tokens with RS256 that verify with the app's public key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const [header = "", payload = "", signature = ""] = githubAppJwt(
      1,
      pem,
      1_700_000_000_000,
    ).split(".");
    const ok = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(publicKey, signature, "base64url");
    expect(ok).toBe(true);
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      iat: 1_699_999_940,
      exp: 1_700_000_540,
      iss: "1",
    });
  });
});

describe("GitLab", () => {
  it("checks the token, lists projects and adds the webhook for deploy on push", async () => {
    await call("PATCH", "/api/settings", { panelUrl: "https://panel.example.com" });
    const bad = await call("POST", "/api/git-providers/gitlab", { token: "glpat-wrong-token" });
    expect(bad.statusCode).toBe(400);

    const added = await call("POST", "/api/git-providers/gitlab", {
      token: "glpat-good-token-123",
    });
    expect(added.statusCode).toBe(201);
    const provider = added.json().provider as GitProvider;
    expect(provider.name).toBe("GitLab · maria");

    const repos = (await call("GET", `/api/git-providers/${provider.id}/repos`)).json().repos;
    expect(repos[0]).toMatchObject({ fullName: "team/api", private: true });

    const created = await call("POST", `/api/projects/${projectId}/applications`, {
      source: "git",
      name: "API",
      repoUrl: "https://gitlab.com/team/api.git",
      gitProviderId: provider.id,
    });
    expect(created.statusCode).toBe(201);
    const hook = t.gitCalls.find((c) => c.url.endsWith("/projects/team%2Fapi/hooks"));
    expect(JSON.parse(hook?.body ?? "{}").url).toBe(
      `https://panel.example.com/api/webhooks/gitlab/${provider.id}`,
    );
    const secret = JSON.parse(hook?.body ?? "{}").token as string;

    const wrong = await t.app.inject({
      method: "POST",
      url: `/api/webhooks/gitlab/${provider.id}`,
      payload: { object_kind: "push", ref: "refs/heads/main" },
      headers: { "x-gitlab-token": "nope" },
    });
    expect(wrong.statusCode).toBe(401);

    const push = await t.app.inject({
      method: "POST",
      url: `/api/webhooks/gitlab/${provider.id}`,
      payload: {
        object_kind: "push",
        ref: "refs/heads/main",
        after: "abc123",
        project: { path_with_namespace: "team/api" },
      },
      headers: { "x-gitlab-token": secret },
    });
    expect(push.statusCode).toBe(202);
    expect(push.json().queued).toBe(1);
    await t.deployer.idle();
    expect(t.runtime.calls[0]).toBe(
      "clone https://oauth2:glpat-good-token-123@gitlab.com/team/api.git main",
    );
  });
});

describe("deploy hook", () => {
  it("deploys with the app's secret URL and can be reset", async () => {
    const created = await call("POST", `/api/projects/${projectId}/applications`, {
      source: "image",
      name: "Docs",
      image: "nginx:alpine",
    });
    const app = created.json().application as Application;
    expect(app.deployToken).toMatch(/^[a-f0-9]{64}$/);

    expect((await t.app.inject({ method: "POST", url: "/api/hooks/deploy/abc" })).statusCode).toBe(
      404,
    );
    const ok = await t.app.inject({ method: "POST", url: `/api/hooks/deploy/${app.deployToken}` });
    expect(ok.statusCode).toBe(202);
    await t.deployer.idle();

    const reset = (await call("POST", `/api/applications/${app.id}/deploy-token`)).json();
    expect(reset.deployToken).not.toBe(app.deployToken);
    const old = await t.app.inject({ method: "POST", url: `/api/hooks/deploy/${app.deployToken}` });
    expect(old.statusCode).toBe(404);
  });
});

describe("settings and helpers", () => {
  it("validates and clears the panel address", async () => {
    expect((await call("PATCH", "/api/settings", { panelUrl: "not a url" })).statusCode).toBe(400);
    const cleared = (await call("PATCH", "/api/settings", { panelUrl: "" })).json();
    expect(cleared.settings.panelUrl).toBeNull();
    expect(cleared.settings.secretConfigured).toBe(true);
  });

  it("reads owner/name from clone addresses", () => {
    expect(repoFullName("https://github.com/acme/shop.git")).toBe("acme/shop");
    expect(repoFullName("https://gitlab.example.com/group/sub/api.git")).toBe("group/sub/api");
  });
});
