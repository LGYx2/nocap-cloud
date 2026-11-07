// POST /api/ideas/:number/vote adds the visitor's 👍 to the idea; DELETE takes it back.
import {
  REPO_NAME,
  REPO_OWNER,
  config,
  github,
  json,
  notConfigured,
  sameOrigin,
  session,
} from "../../_lib.js";

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg) return notConfigured(res);
  const visitor = session(req, cfg);
  if (!visitor) return json(res, 401, { error: "Sign in with GitHub to vote." });
  if (!sameOrigin(req)) return json(res, 403, { error: "Not allowed." });

  const number = Number(req.query?.number);
  if (!Number.isInteger(number) || number < 1) return json(res, 400, { error: "Unknown idea." });
  const base = `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${number}/reactions`;

  try {
    if (req.method === "POST") {
      const result = await github(base, visitor.token, {
        method: "POST",
        body: JSON.stringify({ content: "+1" }),
      });
      if (result.status !== 200 && result.status !== 201) {
        return json(res, 502, { error: "GitHub did not count the vote. Try again." });
      }
      return json(res, 200, { voted: true });
    }

    if (req.method === "DELETE") {
      // GitHub only deletes a reaction by its id, so find the visitor's 👍 first.
      for (let page = 1; page <= 10; page += 1) {
        const result = await github(
          `${base}?content=%2B1&per_page=100&page=${page}`,
          visitor.token,
        );
        if (result.status !== 200) {
          return json(res, 502, { error: "GitHub did not answer. Try again." });
        }
        const mine = result.data.find((reaction) => reaction.user?.login === visitor.login);
        if (mine) {
          await github(`${base}/${mine.id}`, visitor.token, { method: "DELETE" });
          break;
        }
        if (result.data.length < 100) break;
      }
      return json(res, 200, { voted: false });
    }

    return json(res, 405, { error: "Use POST or DELETE." });
  } catch {
    return json(res, 502, { error: "GitHub did not answer. Try again." });
  }
}
