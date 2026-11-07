// GET /api/auth/callback: GitHub sends the visitor back here with a one-time code.
// We swap it for a user token, keep it in an encrypted cookie and return to the ideas board.
import { SITE, config, github, notConfigured, readState, setSession } from "../_lib.js";

function back(res, query = "") {
  res.statusCode = 302;
  res.setHeader("location", `${SITE}/community${query}#ideas`);
  res.end();
}

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg) return notConfigured(res);

  const url = new URL(req.url, SITE);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== readState(req)) return back(res, "?signin=failed");

  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: `${SITE}/api/auth/callback`,
      }),
    });
    const tokens = await response.json();
    if (!tokens.access_token) return back(res, "?signin=failed");

    const user = await github("/user", tokens.access_token);
    if (user.status !== 200) return back(res, "?signin=failed");

    setSession(res, cfg, {
      token: tokens.access_token,
      login: user.data.login,
      avatar: user.data.avatar_url,
    });
    return back(res);
  } catch {
    return back(res, "?signin=failed");
  }
}
