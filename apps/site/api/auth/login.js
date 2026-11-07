// GET /api/auth/login: sends the visitor to GitHub to approve the "Nocap Cloud Ideas" app.
import { randomBytes } from "node:crypto";
import { SITE, config, notConfigured, setState } from "../_lib.js";

export default function handler(req, res) {
  const cfg = config();
  if (!cfg) return notConfigured(res);

  const state = randomBytes(16).toString("base64url");
  setState(res, state);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${SITE}/api/auth/callback`,
    state,
  });
  res.statusCode = 302;
  res.setHeader("location", `https://github.com/login/oauth/authorize?${params}`);
  res.end();
}
