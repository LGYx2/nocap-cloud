// Connected Git accounts.
//
// GitHub: each install creates its own private GitHub App through GitHub's "app manifest" flow, so
// no shared secret ever leaves the server. The app gets read-only access to the repositories the
// user picks and sends push webhooks. Short-lived installation tokens clone private repositories.
//
// GitLab (gitlab.com or self-hosted): a personal access token with read_api, read_repository and,
// for deploy on push, api scope to add the project webhook.
import { createHmac, createSign, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { gitProviders, settings, type Database } from "@nocap/db";
import type { GitProvider, GitRepo, PanelSettings } from "@nocap/shared";
import type { Config } from "./config";
import { secretBox } from "./crypto";
import { HttpError } from "./http";

export type Fetch = typeof fetch;

interface GithubConfig {
  appId: number;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
  htmlUrl: string;
  owner: string;
}

interface GitlabConfig {
  baseUrl: string;
  token: string;
  username: string;
  webhookSecret: string;
}

type ProviderRow = typeof gitProviders.$inferSelect;

const PANEL_URL_KEY = "panel_url";
const STATE_TTL = 60 * 60_000;

const b64url = (value: string) => Buffer.from(value).toString("base64url");

/** A JSON Web Token that proves we are the GitHub App, valid for 9 minutes. */
export function githubAppJwt(appId: number, privateKey: string, now = Date.now()): string {
  const seconds = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: String(appId) }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey, "base64url");
  return `${header}.${payload}.${signature}`;
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Checks GitHub's X-Hub-Signature-256 header against the raw request body. */
export function validGithubSignature(secret: string, body: Buffer, header: string | undefined) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return safeEqual(expected, header);
}

/** "owner/name" from an https clone address. */
export function repoFullName(url: string): string {
  return new URL(url).pathname
    .replace(/^\/+/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

export class GitService {
  private readonly pending = new Map<
    string,
    { providerId: string; panelUrl: string; expires: number }
  >();
  /** Small in-memory cache for GitHub installations and tokens. */
  private readonly cache = new Map<string, { value: unknown; expires: number }>();

  constructor(
    private readonly db: Database,
    private readonly config: Config,
    private readonly http: Fetch = fetch,
  ) {}

  // ---------------------------------------------------------------- settings

  async panelSettings(): Promise<PanelSettings> {
    return {
      panelUrl: await this.panelUrl(),
      version: this.config.NOCAP_VERSION,
      secretConfigured: Boolean(this.config.NOCAP_SECRET),
      dockerNetwork: this.config.DOCKER_NETWORK,
    };
  }

  async panelUrl(): Promise<string | null> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, PANEL_URL_KEY));
    return typeof row?.value === "string" ? row.value : null;
  }

  async setPanelUrl(url: string | null): Promise<void> {
    if (url === null) {
      await this.db.delete(settings).where(eq(settings.key, PANEL_URL_KEY));
      return;
    }
    await this.db
      .insert(settings)
      .values({ key: PANEL_URL_KEY, value: url })
      .onConflictDoUpdate({ target: settings.key, set: { value: url } });
  }

  // ---------------------------------------------------------------- providers

  private box() {
    return secretBox(this.config.NOCAP_SECRET);
  }

  private read<T>(row: ProviderRow): T {
    return JSON.parse(this.box().open(row.configEnc)) as T;
  }

  private async row(id: string): Promise<ProviderRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Git account not found");
    const [row] = await this.db.select().from(gitProviders).where(eq(gitProviders.id, id));
    if (!row) throw new HttpError(404, "Git account not found");
    return row;
  }

  async list(): Promise<GitProvider[]> {
    const rows = await this.db.select().from(gitProviders).orderBy(desc(gitProviders.createdAt));
    return Promise.all(rows.map((row) => this.view(row)));
  }

  async get(id: string): Promise<GitProvider> {
    return this.view(await this.row(id));
  }

  private async view(row: ProviderRow): Promise<GitProvider> {
    const base = {
      id: row.id,
      type: row.type,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
    if (row.type === "github") {
      const cfg = this.read<GithubConfig>(row);
      const installations = await this.githubInstallations(cfg).catch(() => []);
      return {
        ...base,
        url: cfg.htmlUrl,
        installed: installations.length > 0,
        installUrl: `https://github.com/apps/${cfg.slug}/installations/new?state=${row.id}`,
      };
    }
    const cfg = this.read<GitlabConfig>(row);
    return { ...base, url: cfg.baseUrl, installed: true, installUrl: null };
  }

  async remove(id: string): Promise<void> {
    const row = await this.row(id);
    await this.db.delete(gitProviders).where(eq(gitProviders.id, row.id));
  }

  // ---------------------------------------------------------------- GitHub

  /** Step 1: the manifest the browser posts to GitHub to create this install's GitHub App. */
  async githubManifest(panelUrl: string, organization?: string) {
    this.box(); // fail early when secrets cannot be stored
    const providerId = randomUUID();
    const state = randomBytes(16).toString("hex");
    const now = Date.now();
    for (const [key, value] of this.pending) if (value.expires < now) this.pending.delete(key);
    this.pending.set(state, { providerId, panelUrl, expires: now + STATE_TTL });
    await this.setPanelUrl(panelUrl);

    const host = new URL(panelUrl).hostname.replace(/[^a-z0-9-]/gi, "-").slice(0, 20);
    const manifest = {
      name: `Nocap ${host} ${randomBytes(2).toString("hex")}`,
      url: panelUrl,
      hook_attributes: { url: `${panelUrl}/api/webhooks/github/${providerId}`, active: true },
      redirect_url: `${panelUrl}/api/git-providers/github/callback`,
      setup_url: `${panelUrl}/api/git-providers/github/setup`,
      setup_on_update: true,
      public: false,
      default_permissions: { contents: "read", metadata: "read" },
      default_events: ["push"],
    };
    const base = organization
      ? `https://github.com/organizations/${organization}/settings/apps/new`
      : "https://github.com/settings/apps/new";
    return { action: `${base}?state=${state}`, manifest: JSON.stringify(manifest) };
  }

  /** Step 2: GitHub sends the user back with a code; swap it for the app's credentials. */
  async githubFinish(code: string, state: string): Promise<{ id: string; installUrl: string }> {
    const pending = this.pending.get(state);
    if (!pending || pending.expires < Date.now()) {
      throw new HttpError(400, "This GitHub setup link expired. Start again from Git providers.");
    }
    this.pending.delete(state);
    if (!/^[\w-]{1,100}$/.test(code)) throw new HttpError(400, "Invalid code from GitHub");

    const response = await this.http(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: "POST",
      headers: { accept: "application/vnd.github+json", "user-agent": "nocap-cloud" },
    });
    if (!response.ok) throw new HttpError(502, "GitHub did not create the app. Try again.");
    const data = (await response.json()) as {
      id: number;
      slug: string;
      name: string;
      client_id: string;
      client_secret: string;
      webhook_secret: string;
      pem: string;
      html_url: string;
      owner?: { login?: string };
    };
    const cfg: GithubConfig = {
      appId: data.id,
      slug: data.slug,
      clientId: data.client_id,
      clientSecret: data.client_secret,
      privateKey: data.pem,
      webhookSecret: data.webhook_secret,
      htmlUrl: data.html_url,
      owner: data.owner?.login ?? "",
    };
    await this.db.insert(gitProviders).values({
      id: pending.providerId,
      type: "github",
      name: cfg.owner ? `GitHub · ${cfg.owner}` : `GitHub · ${data.name}`,
      configEnc: this.box().seal(JSON.stringify(cfg)),
    });
    return {
      id: pending.providerId,
      installUrl: `https://github.com/apps/${cfg.slug}/installations/new?state=${pending.providerId}`,
    };
  }

  private async githubApi<T>(
    cfg: GithubConfig,
    path: string,
    token?: string,
    init: RequestInit = {},
  ) {
    const response = await this.http(`https://api.github.com${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "nocap-cloud",
        authorization: `Bearer ${token ?? githubAppJwt(cfg.appId, cfg.privateKey)}`,
      },
    });
    if (!response.ok)
      throw new HttpError(502, `GitHub answered ${response.status} for ${path.split("?")[0]}`);
    return (await response.json()) as T;
  }

  private async githubInstallations(cfg: GithubConfig): Promise<number[]> {
    // Cached for a minute: the Git page and repo pickers ask often, GitHub changes rarely.
    const key = `installations:${cfg.appId}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as number[];
    const list = await this.githubApi<Array<{ id: number }>>(
      cfg,
      "/app/installations?per_page=100",
    );
    const ids = list.map((i) => i.id);
    this.cache.set(key, { value: ids, expires: Date.now() + 60_000 });
    return ids;
  }

  private async githubToken(cfg: GithubConfig, installationId: number): Promise<string> {
    // Installation tokens last an hour; reuse one for 50 minutes instead of asking every time.
    const key = `token:${cfg.appId}:${installationId}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as string;
    const data = await this.githubApi<{ token: string }>(
      cfg,
      `/app/installations/${installationId}/access_tokens`,
      undefined,
      { method: "POST" },
    );
    this.cache.set(key, { value: data.token, expires: Date.now() + 50 * 60_000 });
    return data.token;
  }

  private async githubTokenFor(cfg: GithubConfig, fullName: string): Promise<string> {
    const install = await this.githubApi<{ id: number }>(
      cfg,
      `/repos/${fullName}/installation`,
    ).catch(() => {
      throw new HttpError(
        400,
        `The GitHub App cannot see ${fullName}. Add the repository to the app's installation.`,
      );
    });
    return this.githubToken(cfg, install.id);
  }

  // ---------------------------------------------------------------- GitLab

  private async gitlabApi<T>(
    cfg: Pick<GitlabConfig, "baseUrl" | "token">,
    path: string,
    init: RequestInit = {},
  ) {
    const response = await this.http(`${cfg.baseUrl}/api/v4${path}`, {
      ...init,
      headers: {
        "private-token": cfg.token,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (response.status === 401) throw new HttpError(400, "GitLab did not accept the token.");
    if (!response.ok) throw new HttpError(502, `GitLab answered ${response.status}`);
    return (await response.json()) as T;
  }

  async addGitlab(input: { name?: string; baseUrl: string; token: string }): Promise<GitProvider> {
    const user = await this.gitlabApi<{ username: string }>(input, "/user");
    const cfg: GitlabConfig = {
      baseUrl: input.baseUrl,
      token: input.token,
      username: user.username,
      webhookSecret: randomBytes(24).toString("hex"),
    };
    const host = new URL(input.baseUrl).hostname;
    const [row] = await this.db
      .insert(gitProviders)
      .values({
        type: "gitlab",
        name: input.name || `GitLab · ${user.username}${host === "gitlab.com" ? "" : ` (${host})`}`,
        configEnc: this.box().seal(JSON.stringify(cfg)),
      })
      .returning();
    if (!row) throw new Error("Git account was not saved");
    return this.view(row);
  }

  /** Adds the push webhook to a GitLab project. Best effort: returns false when it cannot. */
  async gitlabAddHook(providerId: string, fullName: string): Promise<boolean> {
    const row = await this.row(providerId);
    const panelUrl = await this.panelUrl();
    if (row.type !== "gitlab" || !panelUrl) return false;
    const cfg = this.read<GitlabConfig>(row);
    try {
      await this.gitlabApi(cfg, `/projects/${encodeURIComponent(fullName)}/hooks`, {
        method: "POST",
        body: JSON.stringify({
          url: `${panelUrl}/api/webhooks/gitlab/${row.id}`,
          token: cfg.webhookSecret,
          push_events: true,
          enable_ssl_verification: panelUrl.startsWith("https://"),
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- shared

  async repos(providerId: string, search = ""): Promise<GitRepo[]> {
    const row = await this.row(providerId);
    const needle = search.trim().toLowerCase();
    let repos: GitRepo[] = [];
    if (row.type === "github") {
      const cfg = this.read<GithubConfig>(row);
      for (const installation of await this.githubInstallations(cfg)) {
        const token = await this.githubToken(cfg, installation);
        for (let page = 1; page <= 5; page += 1) {
          const data = await this.githubApi<{
            repositories: Array<{
              full_name: string;
              clone_url: string;
              private: boolean;
              default_branch: string;
              pushed_at: string | null;
            }>;
          }>(cfg, `/installation/repositories?per_page=100&page=${page}`, token);
          repos.push(
            ...data.repositories.map((r) => ({
              fullName: r.full_name,
              url: r.clone_url,
              private: r.private,
              defaultBranch: r.default_branch,
              updatedAt: r.pushed_at,
            })),
          );
          if (data.repositories.length < 100) break;
        }
      }
    } else {
      const cfg = this.read<GitlabConfig>(row);
      const query = new URLSearchParams({
        membership: "true",
        simple: "true",
        per_page: "100",
        order_by: "last_activity_at",
        ...(needle ? { search: needle } : {}),
      });
      const data = await this.gitlabApi<
        Array<{
          path_with_namespace: string;
          http_url_to_repo: string;
          visibility: string;
          default_branch: string | null;
          last_activity_at: string | null;
        }>
      >(cfg, `/projects?${query}`);
      repos = data.map((p) => ({
        fullName: p.path_with_namespace,
        url: p.http_url_to_repo,
        private: p.visibility !== "public",
        defaultBranch: p.default_branch ?? "main",
        updatedAt: p.last_activity_at,
      }));
    }
    if (needle) repos = repos.filter((r) => r.fullName.toLowerCase().includes(needle));
    return repos.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  async branches(providerId: string, fullName: string): Promise<string[]> {
    const row = await this.row(providerId);
    if (!/^[\w.-]+(\/[\w.-]+)+$/.test(fullName)) throw new HttpError(400, "Unknown repository");
    if (row.type === "github") {
      const cfg = this.read<GithubConfig>(row);
      const token = await this.githubTokenFor(cfg, fullName);
      const data = await this.githubApi<Array<{ name: string }>>(
        cfg,
        `/repos/${fullName}/branches?per_page=100`,
        token,
      );
      return data.map((b) => b.name);
    }
    const cfg = this.read<GitlabConfig>(row);
    const data = await this.gitlabApi<Array<{ name: string }>>(
      cfg,
      `/projects/${encodeURIComponent(fullName)}/repository/branches?per_page=100`,
    );
    return data.map((b) => b.name);
  }

  /**
   * A clone address with short-lived credentials, and the secret to hide from build logs.
   * GitHub tokens last one hour; GitLab uses the stored token.
   */
  async cloneUrl(providerId: string, repoUrl: string): Promise<{ url: string; secret: string }> {
    const row = await this.row(providerId);
    const url = new URL(repoUrl);
    if (row.type === "github") {
      const cfg = this.read<GithubConfig>(row);
      const token = await this.githubTokenFor(cfg, repoFullName(repoUrl));
      url.username = "x-access-token";
      url.password = token;
      return { url: url.toString(), secret: token };
    }
    const cfg = this.read<GitlabConfig>(row);
    url.username = "oauth2";
    url.password = cfg.token;
    return { url: url.toString(), secret: cfg.token };
  }

  /** The secret a provider's webhooks are signed with. */
  async webhookSecret(providerId: string, type: "github" | "gitlab"): Promise<string | null> {
    const row = await this.row(providerId).catch(() => null);
    if (!row || row.type !== type) return null;
    return type === "github"
      ? this.read<GithubConfig>(row).webhookSecret
      : this.read<GitlabConfig>(row).webhookSecret;
  }
}
