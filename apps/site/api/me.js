// GET /api/me: who is signed in. { user: null } when nobody is, 503 when sign-in is not set up.
import { config, json, notConfigured, session } from "./_lib.js";

export default function handler(req, res) {
  const cfg = config();
  if (!cfg) return notConfigured(res);
  const visitor = session(req, cfg);
  return json(res, 200, {
    user: visitor ? { login: visitor.login, avatar: visitor.avatar } : null,
  });
}
