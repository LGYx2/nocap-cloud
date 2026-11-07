// POST /api/auth/logout: forgets the visitor's GitHub sign-in on this site.
import { clearSession, json, sameOrigin } from "../_lib.js";

export default function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Use POST." });
  if (!sameOrigin(req)) return json(res, 403, { error: "Not allowed." });
  clearSession(res);
  return json(res, 200, { ok: true });
}
