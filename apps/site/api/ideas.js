// GET /api/ideas: open ideas with vote counts and whether the signed-in visitor voted.
// POST /api/ideas: opens a new idea issue on GitHub as the signed-in visitor.
import {
  REPO_NAME,
  REPO_OWNER,
  config,
  github,
  json,
  notConfigured,
  readBody,
  sameOrigin,
  session,
} from "./_lib.js";

export const AREAS = [
  "Deploy",
  "Git",
  "Domains and HTTPS",
  "Databases and backups",
  "Monitoring",
  "Panel",
  "Servers",
  "Other",
];
const MARKER = "<!-- nocap:idea -->";

const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(first: 50, states: OPEN, labels: ["idea"], orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        number title body url createdAt
        author { login }
        comments { totalCount }
        reactionGroups { content viewerHasReacted reactors { totalCount } }
      }
    }
  }
}`;

async function list(res, visitor) {
  const result = await github("/graphql", visitor.token, {
    method: "POST",
    body: JSON.stringify({ query: QUERY, variables: { owner: REPO_OWNER, name: REPO_NAME } }),
  });
  const nodes = result.data?.data?.repository?.issues?.nodes;
  if (result.status !== 200 || !nodes) {
    return json(res, 502, { error: "GitHub did not answer. Try again in a moment." });
  }
  const ideas = nodes.map((issue) => {
    const up = issue.reactionGroups.find((group) => group.content === "THUMBS_UP");
    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      url: issue.url,
      createdAt: issue.createdAt,
      author: issue.author?.login ?? "ghost",
      comments: issue.comments.totalCount,
      votes: up?.reactors.totalCount ?? 0,
      voted: up?.viewerHasReacted ?? false,
    };
  });
  return json(res, 200, { ideas });
}

function clean(value, max) {
  return String(value ?? "")
    .replace(/<!--|-->/g, "")
    .trim()
    .slice(0, max);
}

async function create(req, res, visitor) {
  if (!sameOrigin(req)) return json(res, 403, { error: "Not allowed." });
  const input = await readBody(req);
  const title = clean(input.title, 120);
  const problem = clean(input.problem, 2000);
  const idea = clean(input.idea, 2000);
  const area = AREAS.includes(input.area) ? input.area : "Other";

  const fields = {};
  if (title.length < 6) fields.title = "Give the idea a short title.";
  if (problem.length < 10) fields.problem = "Say what gets in the way today.";
  if (idea.length < 10) fields.idea = "Say how Nocap Cloud could solve it.";
  if (Object.keys(fields).length) return json(res, 400, { error: "Check the form.", fields });

  const body = [
    "### The problem",
    "",
    problem,
    "",
    "### The idea",
    "",
    idea,
    "",
    "### Area",
    "",
    area,
    "",
    "_Suggested on [nocapcloud.click](https://nocapcloud.click/community#ideas)._",
    MARKER,
  ].join("\n");

  const result = await github(`/repos/${REPO_OWNER}/${REPO_NAME}/issues`, visitor.token, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  if (result.status !== 201) {
    return json(res, 502, { error: "GitHub did not accept the idea. Try again in a moment." });
  }
  return json(res, 201, {
    idea: {
      number: result.data.number,
      title,
      body,
      url: result.data.html_url,
      createdAt: result.data.created_at,
      author: visitor.login,
      comments: 0,
      votes: 0,
      voted: false,
    },
  });
}

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg) return notConfigured(res);
  const visitor = session(req, cfg);
  if (!visitor) return json(res, 401, { error: "Sign in with GitHub first." });

  try {
    if (req.method === "GET") return await list(res, visitor);
    if (req.method === "POST") return await create(req, res, visitor);
    return json(res, 405, { error: "Use GET or POST." });
  } catch {
    return json(res, 502, { error: "GitHub did not answer. Try again in a moment." });
  }
}
