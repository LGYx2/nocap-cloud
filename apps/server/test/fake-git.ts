import { generateKeyPairSync } from "node:crypto";
import type { Fetch } from "../src/git";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

/** Answers the GitHub and GitLab API calls Nocap makes, so tests never touch the network. */
export function fakeGitHosts() {
  const calls: Array<{ method: string; url: string; body?: string; auth?: string }> = [];

  const fetchImpl: Fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({
      method,
      url,
      body: typeof init?.body === "string" ? init.body : undefined,
      auth: headers.get("authorization") ?? headers.get("private-token") ?? undefined,
    });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });
    const path = url.replace(/^https:\/\/[^/]+/, "");

    // GitHub
    if (path.startsWith("/app-manifests/good-code/conversions")) {
      return json({
        id: 4242,
        slug: "nocap-test",
        name: "Nocap test",
        client_id: "Iv1.test",
        client_secret: "client-secret",
        webhook_secret: "hook-secret",
        pem,
        html_url: "https://github.com/apps/nocap-test",
        owner: { login: "acme" },
      });
    }
    if (path.startsWith("/app-manifests/")) return json({ message: "Not Found" }, 404);
    if (path.startsWith("/app/installations?")) return json([{ id: 77 }]);
    if (path === "/app/installations/77/access_tokens")
      return json({ token: "ghs_installtoken123" });
    if (path === "/repos/acme/shop/installation") return json({ id: 77 });
    if (path.startsWith("/repos/") && path.endsWith("/installation")) return json({}, 404);
    if (path.startsWith("/installation/repositories")) {
      return json({
        repositories: [
          {
            full_name: "acme/shop",
            clone_url: "https://github.com/acme/shop.git",
            private: true,
            default_branch: "main",
            pushed_at: "2026-11-07T10:00:00Z",
          },
          {
            full_name: "acme/docs",
            clone_url: "https://github.com/acme/docs.git",
            private: false,
            default_branch: "main",
            pushed_at: "2026-11-01T10:00:00Z",
          },
        ],
      });
    }
    if (path.startsWith("/repos/acme/shop/branches"))
      return json([{ name: "main" }, { name: "staging" }]);

    // GitLab
    if (path === "/api/v4/user") {
      return headers.get("private-token") === "glpat-good-token-123"
        ? json({ username: "maria" })
        : json({ message: "401 Unauthorized" }, 401);
    }
    if (path.startsWith("/api/v4/projects?")) {
      return json([
        {
          path_with_namespace: "team/api",
          http_url_to_repo: "https://gitlab.com/team/api.git",
          visibility: "private",
          default_branch: "main",
          last_activity_at: "2026-11-06T10:00:00Z",
        },
      ]);
    }
    if (path.includes("/repository/branches")) return json([{ name: "main" }]);
    if (path.endsWith("/hooks") && method === "POST") return json({ id: 1 }, 201);

    return json({ message: `Unexpected ${method} ${url}` }, 500);
  };

  return { fetch: fetchImpl, calls };
}
