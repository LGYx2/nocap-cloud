// Community page: the ideas board and the contributors list.
//
// Every idea is a GitHub issue labelled "idea" and every vote is a 👍 reaction on it. On
// nocapcloud.click visitors sign in with GitHub and vote or suggest right on the page; the site's
// server functions (apps/site/api) talk to GitHub for them. Where those functions do not exist
// (the GitHub Pages mirror, or before sign-in is set up) the board reads the public API and
// sends people to GitHub to vote.
const REPO = "LGYx2/nocap-cloud";
const NEW_IDEA = `https://github.com/${REPO}/issues/new?template=idea.yml`;
const PENDING_VOTE = "nocap-pending-vote";

/** Ideas from the roadmap discussion, shown until the community has posted its own. */
const STARTER_IDEAS = [
  {
    title: "One-click app templates (n8n, Plausible, Uptime Kuma)",
    area: "Deploy",
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

/** Reads one "### Heading" section of an issue written from the idea form. */
function section(body, heading) {
  const match = new RegExp(`###\\s*${heading}\\s*\\n+([\\s\\S]*?)(?=\\n###|$)`, "i").exec(body);
  return match?.[1]?.trim();
}

function plain(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/_Suggested on .*_/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIdea(issue) {
  const body = issue.body ?? "";
  const area = section(body, "Area");
  return {
    number: issue.number,
    title: issue.title,
    summary: plain(section(body, "The idea") ?? body).slice(0, 220),
    area: area && area !== "_No response_" ? area : undefined,
    votes: issue.votes,
    voted: issue.voted ?? false,
    created: new Date(issue.createdAt).getTime(),
    url: issue.url,
    meta: `#${issue.number} by @${escapeHtml(issue.author)}, ${timeAgo(issue.createdAt)} · ${issue.comments} ${issue.comments === 1 ? "comment" : "comments"}`,
  };
}

function starterIdeas() {
  return STARTER_IDEAS.map((idea, index) => ({
    title: idea.title,
    summary: idea.body,
    area: idea.area,
    votes: 0,
    voted: false,
    created: -index,
    url: `${NEW_IDEA}&title=${encodeURIComponent(idea.title)}`,
    meta: "From the roadmap. Post it to start its vote.",
    starter: idea,
  }));
}

function storage(action) {
  try {
    return action(sessionStorage);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- sign-in
/** "off": no sign-in on this host. "out": can sign in. "in": signed in. */
let auth = "off";
let me = null;

async function loadMe() {
  try {
    const response = await fetch("/api/me", { headers: { accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json();
    me = data.user;
    auth = me ? "in" : "out";
  } catch {
    // Static hosting without the server functions: keep the GitHub links.
  }
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  me = null;
  auth = "out";
  renderAccount();
  void loadIdeas();
}

function renderAccount() {
  const box = document.querySelector("[data-account]");
  if (!box) return;
  if (auth === "off") {
    box.innerHTML = "";
    return;
  }
  if (auth === "out") {
    box.innerHTML = `
      <a href="/api/auth/login" class="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent">
        <svg class="size-4" aria-hidden="true"><use href="#github" /></svg>
        Sign in to vote
      </a>`;
    return;
  }
  box.innerHTML = `
    <span class="inline-flex h-9 items-center gap-2 rounded-md border bg-background py-1 pr-1 pl-1.5 text-sm shadow-xs">
      <img src="${escapeHtml(me.avatar)}&s=48" alt="" width="24" height="24" class="size-6 rounded-full" />
      <span class="max-w-32 truncate font-medium">@${escapeHtml(me.login)}</span>
      <button type="button" data-sign-out class="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">Sign out</button>
    </span>`;
  box.querySelector("[data-sign-out]")?.addEventListener("click", () => void signOut());
}

// ---------------------------------------------------------------- ideas board
const board = document.querySelector("[data-ideas]");
const status = document.querySelector("[data-ideas-status]");
let ideas = [];
let sort = "top";

const arrow = `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>`;

function voteControl(idea, index) {
  const count = `<span class="text-sm font-semibold tabular-nums">${idea.votes}</span>`;
  if (auth === "off") {
    return `<a class="vote-button" href="${idea.url}" title="Vote with a 👍 on GitHub">${arrow}${count}<span class="sr-only">votes, vote on GitHub</span></a>`;
  }
  const label = idea.starter
    ? "Post this idea to start its vote"
    : idea.voted
      ? "Remove your vote"
      : "Vote for this idea";
  return `<button type="button" class="vote-button" data-vote="${index}" aria-pressed="${idea.voted}" title="${label}"${idea.busy ? " disabled" : ""}>${arrow}${count}<span class="sr-only">votes. ${label}</span></button>`;
}

function renderIdeas() {
  if (!board) return;
  const list = [...ideas].sort((a, b) =>
    sort === "top" ? b.votes - a.votes || b.created - a.created : b.created - a.created,
  );
  board.innerHTML = list
    .map(
      (idea) => `
      <li class="spotlight flex gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        ${voteControl(idea, ideas.indexOf(idea))}
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <a href="${idea.url}" class="font-medium hover:underline">${escapeHtml(idea.title)}</a>
            ${idea.area ? `<span class="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">${escapeHtml(idea.area)}</span>` : ""}
          </div>
          <p class="mt-1 line-clamp-2 text-sm text-muted-foreground">${escapeHtml(idea.summary)}</p>
          <p class="mt-2 text-xs text-muted-foreground">${idea.meta}</p>
        </div>
      </li>`,
    )
    .join("");
}

function say(text) {
  if (status) status.textContent = text;
}

async function publicIdeas() {
  const query = encodeURIComponent(`repo:${REPO} is:issue is:open label:idea`);
  const response = await fetch(
    `https://api.github.com/search/issues?q=${query}&sort=reactions-%2B1&order=desc&per_page=50`,
    { headers: { accept: "application/vnd.github+json" } },
  );
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const data = await response.json();
  return data.items.map((issue) =>
    toIdea({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
      createdAt: issue.created_at,
      author: issue.user.login,
      comments: issue.comments,
      votes: issue.reactions?.["+1"] ?? 0,
    }),
  );
}

async function signedInIdeas() {
  const response = await fetch("/api/ideas", { headers: { accept: "application/json" } });
  if (response.status === 401) {
    auth = "out";
    me = null;
    renderAccount();
    return publicIdeas();
  }
  if (!response.ok) throw new Error(`Server answered ${response.status}`);
  return (await response.json()).ideas.map(toIdea);
}

async function loadIdeas() {
  try {
    const live = auth === "in" ? await signedInIdeas() : await publicIdeas();
    ideas = live.length ? live : starterIdeas();
    const how =
      auth === "off"
        ? "Votes are 👍 reactions on each GitHub issue."
        : auth === "out"
          ? "Sign in with GitHub to vote here."
          : "Click the arrow to vote, click again to take it back.";
    say(
      live.length
        ? `${live.length} open ideas. ${how}`
        : "No ideas posted yet. Here are some from the roadmap: post one to start its vote.",
    );
  } catch {
    ideas = starterIdeas();
    say("Could not reach GitHub right now. Showing ideas from the roadmap instead.");
  }
  renderIdeas();
}

function signIn(pendingVote) {
  if (pendingVote) storage((s) => s.setItem(PENDING_VOTE, String(pendingVote)));
  window.location.assign("/api/auth/login");
}

async function toggleVote(idea) {
  if (idea.starter) {
    openSuggest({ title: idea.starter.title, idea: idea.starter.body, area: idea.starter.area });
    return;
  }
  if (auth !== "in") return signIn(idea.number);
  if (idea.busy) return;

  // Show the vote at once, then tell GitHub; undo it if GitHub says no.
  const voted = !idea.voted;
  idea.voted = voted;
  idea.votes += voted ? 1 : -1;
  idea.busy = true;
  renderIdeas();
  board?.querySelector(`[data-vote="${ideas.indexOf(idea)}"]`)?.classList.add("bump");

  try {
    const response = await fetch(`/api/ideas/${idea.number}/vote`, {
      method: voted ? "POST" : "DELETE",
    });
    if (response.status === 401) return signIn(idea.number);
    if (!response.ok) throw new Error(`Server answered ${response.status}`);
  } catch {
    idea.voted = !voted;
    idea.votes += voted ? -1 : 1;
    say("That vote did not go through. Try again in a moment.");
  } finally {
    idea.busy = false;
    renderIdeas();
  }
}

board?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-vote]") : null;
  if (!(button instanceof HTMLButtonElement)) return;
  const idea = ideas[Number(button.dataset.vote)];
  if (idea) void toggleVote(idea);
});

for (const chip of document.querySelectorAll("[data-sort]")) {
  chip.addEventListener("click", () => {
    sort = chip.dataset.sort ?? "top";
    for (const other of document.querySelectorAll("[data-sort]")) {
      other.setAttribute("aria-pressed", String(other === chip));
    }
    renderIdeas();
  });
}

/** After signing in to vote, count the vote the visitor clicked before leaving. */
async function applyPendingVote() {
  const number = Number(storage((s) => s.getItem(PENDING_VOTE)));
  storage((s) => s.removeItem(PENDING_VOTE));
  if (auth !== "in" || !number) return;
  const idea = ideas.find((item) => item.number === number);
  if (idea && !idea.voted) await toggleVote(idea);
}

// ---------------------------------------------------------------- suggest an idea
const dialog = document.querySelector("[data-idea-dialog]");
const form = document.querySelector("[data-idea-form]");

function openSuggest(prefill = {}) {
  if (!(dialog instanceof HTMLDialogElement) || !(form instanceof HTMLFormElement)) return;
  const signedIn = auth === "in";
  form.querySelector("[data-signed-in]")?.toggleAttribute("hidden", !signedIn);
  form.querySelector("[data-signed-out]")?.toggleAttribute("hidden", signedIn);
  for (const [name, value] of Object.entries(prefill)) {
    const field = form.elements.namedItem(name);
    if (field && "value" in field) field.value = value;
  }
  for (const error of form.querySelectorAll("[data-error]")) error.textContent = "";
  const formStatus = form.querySelector("[data-form-status]");
  if (formStatus) formStatus.textContent = "";
  dialog.showModal();
  if (signedIn) form.querySelector("input[name=title]")?.focus();
}

for (const link of document.querySelectorAll("[data-suggest]")) {
  link.addEventListener("click", (event) => {
    if (auth === "off") return; // No sign-in here: the link opens the GitHub form.
    event.preventDefault();
    openSuggest();
  });
}

for (const close of document.querySelectorAll("[data-idea-dialog] [data-close]")) {
  close.addEventListener("click", () => dialog?.close());
}
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close(); // a click on the backdrop
});

form?.addEventListener("input", (event) => {
  const name = event.target instanceof Element ? event.target.getAttribute("name") : null;
  const slot = name ? form.querySelector(`[data-error="${name}"]`) : null;
  if (slot) slot.textContent = "";
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(form instanceof HTMLFormElement)) return;
  const submit = form.querySelector("button[type=submit]");
  const formStatus = form.querySelector("[data-form-status]");
  for (const error of form.querySelectorAll("[data-error]")) error.textContent = "";
  if (submit) submit.disabled = true;
  if (formStatus) formStatus.textContent = "Posting to GitHub…";

  try {
    const response = await fetch("/api/ideas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return signIn();
    if (!response.ok) {
      for (const [name, message] of Object.entries(data.fields ?? {})) {
        const slot = form.querySelector(`[data-error="${name}"]`);
        if (slot) slot.textContent = message;
      }
      if (formStatus) formStatus.textContent = data.error ?? "Something went wrong.";
      return;
    }
    const idea = toIdea(data.idea);
    ideas = [idea, ...ideas.filter((item) => !item.starter || item.title !== idea.title)];
    sort = "new";
    for (const chip of document.querySelectorAll("[data-sort]")) {
      chip.setAttribute("aria-pressed", String(chip.getAttribute("data-sort") === "new"));
    }
    renderIdeas();
    say(`Posted #${idea.number}. Thanks! Share it so people can vote.`);
    form.reset();
    dialog?.close();
    document.querySelector("#ideas")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    if (formStatus) formStatus.textContent = "Could not reach the server. Try again.";
  } finally {
    if (submit) submit.disabled = false;
  }
});

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

async function start() {
  await loadMe();
  renderAccount();
  await loadIdeas();
  if (new URLSearchParams(window.location.search).get("signin") === "failed") {
    say("GitHub sign-in did not finish. Try again.");
    history.replaceState(null, "", `${window.location.pathname}#ideas`);
  }
  await applyPendingVote();
}

void start();
void loadContributors();
