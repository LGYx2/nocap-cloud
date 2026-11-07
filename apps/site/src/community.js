// Community page: the ideas board (GitHub issues labelled "idea", votes are 👍 reactions)
// and the contributors list. Both read the public GitHub API from the visitor's browser.
const REPO = "LGYx2/nocap-cloud";
const NEW_IDEA = `https://github.com/${REPO}/issues/new?template=idea.yml`;

/** Ideas from the roadmap discussion, shown until the community has posted its own. */
const STARTER_IDEAS = [
  {
    title: "One-click app templates (n8n, Plausible, Uptime Kuma)",
    area: "Apps",
    body: "Pick a template, set a domain, and it runs. No Dockerfile needed.",
  },
  {
    title: "Preview deployments for every pull request",
    area: "Git",
    body: "Each pull request gets its own temporary URL, removed when it is merged.",
  },
  {
    title: "Notifications on Slack, Discord, Telegram and email",
    area: "Monitoring",
    body: "Hear about failed deploys and full disks where the team already talks.",
  },
  {
    title: "Deploy to more servers over SSH from one panel",
    area: "Servers",
    body: "Add a second server and choose where each app runs.",
  },
  {
    title: "Builds without a Dockerfile (Nixpacks or buildpacks)",
    area: "Deploy",
    body: "Detect Node, Python, PHP or Go and build the image automatically.",
  },
  {
    title: "Panel in Portuguese and other languages",
    area: "Panel",
    body: "Translate the panel so more teams can use it in their own language.",
  },
];

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function timeAgo(iso) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

// ---------------------------------------------------------------- ideas board
const board = document.querySelector("[data-ideas]");
const status = document.querySelector("[data-ideas-status]");
let ideas = [];
let sort = "top";

function renderIdeas() {
  if (!board) return;
  const list = [...ideas].sort((a, b) =>
    sort === "top" ? b.votes - a.votes || b.created - a.created : b.created - a.created,
  );
  board.innerHTML = list
    .map(
      (idea) => `
      <li class="spotlight flex gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <a class="vote-button" href="${idea.url}" title="Vote with a 👍 on GitHub">
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>
          <span class="text-sm font-semibold tabular-nums">${idea.votes}</span>
          <span class="sr-only">votes, vote on GitHub</span>
        </a>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <a href="${idea.url}" class="font-medium hover:underline">${escapeHtml(idea.title)}</a>
            ${idea.area ? `<span class="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">${escapeHtml(idea.area)}</span>` : ""}
          </div>
          <p class="mt-1 line-clamp-2 text-sm text-muted-foreground">${escapeHtml(idea.body)}</p>
          <p class="mt-2 text-xs text-muted-foreground">${idea.meta}</p>
        </div>
      </li>`,
    )
    .join("");
}

function starterIdeas() {
  return STARTER_IDEAS.map((idea, index) => ({
    ...idea,
    votes: 0,
    created: -index,
    url: `${NEW_IDEA}&title=${encodeURIComponent(idea.title)}`,
    meta: "Suggested from the roadmap. Open it on GitHub to start the vote.",
  }));
}

async function loadIdeas() {
  try {
    const query = encodeURIComponent(`repo:${REPO} is:issue is:open label:idea`);
    const response = await fetch(
      `https://api.github.com/search/issues?q=${query}&sort=reactions-%2B1&order=desc&per_page=50`,
      { headers: { accept: "application/vnd.github+json" } },
    );
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const data = await response.json();
    const live = data.items.map((issue) => ({
      title: issue.title,
      body: (issue.body ?? "").replace(/[#*_>`]/g, "").slice(0, 220),
      area: issue.labels
        .map((l) => l.name)
        .find((name) => name.startsWith("area:"))
        ?.slice(5),
      votes: issue.reactions?.["+1"] ?? 0,
      created: new Date(issue.created_at).getTime(),
      url: issue.html_url,
      meta: `#${issue.number} by @${escapeHtml(issue.user.login)}, ${timeAgo(issue.created_at)} · ${issue.comments} comments`,
    }));
    ideas = live.length ? live : starterIdeas();
    if (status) {
      status.textContent = live.length
        ? `${live.length} open ideas from GitHub. Votes are 👍 reactions on each issue.`
        : "No ideas posted yet. Here are some from the roadmap: open one on GitHub to start its vote.";
    }
  } catch {
    ideas = starterIdeas();
    if (status) {
      status.textContent =
        "Could not reach GitHub right now. Showing ideas from the roadmap instead.";
    }
  }
  renderIdeas();
}

for (const chip of document.querySelectorAll("[data-sort]")) {
  chip.addEventListener("click", () => {
    sort = chip.dataset.sort ?? "top";
    for (const other of document.querySelectorAll("[data-sort]")) {
      other.setAttribute("aria-pressed", String(other === chip));
    }
    renderIdeas();
  });
}

// ---------------------------------------------------------------- contributors
async function loadContributors() {
  const grid = document.querySelector("[data-contributors]");
  if (!grid) return;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/contributors?per_page=60`);
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const people = (await response.json()).filter((person) => person.type !== "Bot");
    grid.innerHTML = people
      .map(
        (person) => `
        <li>
          <a href="${person.html_url}" class="spotlight flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
            <img src="${person.avatar_url}&s=96" alt="" width="40" height="40" loading="lazy" class="size-10 rounded-full border" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">@${escapeHtml(person.login)}</span>
              <span class="block text-xs text-muted-foreground">${person.contributions} commits</span>
            </span>
          </a>
        </li>`,
      )
      .join("");
  } catch {
    grid.innerHTML = `<li class="text-sm text-muted-foreground">Could not load contributors from GitHub right now.</li>`;
  }
}

void loadIdeas();
void loadContributors();
