// Shared code for the website's server functions (Vercel). Files starting with "_" are not routes.
//
// Visitors sign in with the "Nocap Cloud Ideas" GitHub App. Its user token can only touch issues
// on the repositories where the app is installed, which is just nocap-cloud. The token is kept in
// an encrypted, httpOnly cookie, so the browser never sees it.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const REPO_OWNER = "LGYx2";
export const REPO_NAME = "nocap-cloud";
export const SITE = "https://nocapcloud.click";
const COOKIE = "nocap_gh";
const STATE_COOKIE = "nocap_gh_state";

export function config() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  // The cookie key is derived from the client secret, so there is one secret less to manage.
  const key = createHash("sha256").update(`nocap-session:${clientSecret}`).digest();
  return { clientId, clientSecret, key };
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function readCookies(req) {
  const cookies = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1));
  }
  return cookies;
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function seal(key, data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal(key, value) {
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The signed-in visitor ({ token, login, avatar }), or null. */
export function session(req, cfg) {
  const value = readCookies(req)[COOKIE];
  if (!value) return null;
  const data = unseal(cfg.key, value);
  if (!data || data.expires < Date.now()) return null;
  return data;
}

export function setSession(res, cfg, data) {
  // GitHub App user tokens last 8 hours; the cookie lasts as long as the token.
  const maxAge = 8 * 3600 - 300;
  const sealed = seal(cfg.key, { ...data, expires: Date.now() + maxAge * 1000 });
  res.setHeader("set-cookie", [cookie(COOKIE, sealed, maxAge), cookie(STATE_COOKIE, "", 0)]);
}

export function clearSession(res) {
  res.setHeader("set-cookie", cookie(COOKIE, "", 0));
}

export function setState(res, state) {
  res.setHeader("set-cookie", cookie(STATE_COOKIE, state, 600));
}

export function readState(req) {
  return readCookies(req)[STATE_COOKIE];
}

/** Rejects writes that do not come from the site itself. */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === SITE || origin.endsWith(".vercel.app");
}

export async function github(path, token, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "nocap-cloud-site",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    return {};
  }
}

export function notConfigured(res) {
  json(res, 503, { error: "Sign-in is not set up yet." });
}
