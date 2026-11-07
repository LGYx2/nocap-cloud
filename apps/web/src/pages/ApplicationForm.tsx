import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Application, ApplicationInput, AppSource, GitRepo } from "@nocap/shared";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { api, ApiRequestError } from "../api";
import { CheckIcon, GitBranchIcon, ImageIcon, LockIcon, SearchIcon } from "../components/icons";
import { Alert, Button, cn, Field } from "../components/ui";
import { timeAgo } from "../lib/format";
import { branchesQuery, gitProvidersQuery, refreshApps, reposQuery } from "../queries";

const SOURCES: Array<{ value: AppSource; label: string; detail: string; icon: typeof ImageIcon }> =
  [
    {
      value: "git",
      label: "Git repository",
      detail: "Build from a Dockerfile",
      icon: GitBranchIcon,
    },
    { value: "image", label: "Docker image", detail: "Run a ready-made image", icon: ImageIcon },
  ];

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-field px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Searchable list of the repositories a connected account can read. */
function RepoPicker({
  providerId,
  selected,
  onPick,
}: {
  providerId: string;
  selected: string;
  onPick: (repo: GitRepo) => void;
}) {
  const { data: repos = [], isPending, error } = useQuery(reposQuery(providerId));
  const [filter, setFilter] = useState("");
  const shown = useMemo(
    () => repos.filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase())).slice(0, 50),
    [repos, filter],
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-medium">Repository</span>
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-3.5 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search repositories"
            aria-label="Search repositories"
            className="h-9 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <ul className="max-h-52 overflow-auto" role="listbox" aria-label="Repositories">
          {isPending ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">Loading repositories…</li>
          ) : error ? (
            <li className="px-3 py-3 text-sm text-destructive">{error.message}</li>
          ) : shown.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              No repositories. For GitHub, add them to the app under Git providers.
            </li>
          ) : (
            shown.map((repo) => (
              <li key={repo.fullName} role="option" aria-selected={selected === repo.url}>
                <button
                  type="button"
                  onClick={() => onPick(repo)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                    selected === repo.url && "bg-accent",
                  )}
                >
                  {repo.private ? (
                    <LockIcon className="size-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <GitBranchIcon className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{repo.fullName}</span>
                  {repo.updatedAt ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(repo.updatedAt)}
                    </span>
                  ) : null}
                  {selected === repo.url ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

/** Form to add an application to a project. Opens the new app's page when done. */
export function ApplicationForm({
  projectId,
  onCancel,
}: {
  projectId: string;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const { data: providers = [] } = useQuery(gitProvidersQuery);
  const [source, setSource] = useState<AppSource>("git");
  // "" means a public repository typed as a URL.
  const [providerId, setProviderId] = useState<string>("");
  const [repoName, setRepoName] = useState("");
  const [autoDeploy, setAutoDeploy] = useState(true);
  const [form, setForm] = useState({
    name: "",
    repoUrl: "",
    branch: "main",
    dockerfilePath: "Dockerfile",
    image: "",
    port: "3000",
  });
  const { data: branches } = useQuery({
    ...branchesQuery(providerId, repoName),
    enabled: Boolean(providerId && repoName),
  });

  const create = useMutation({
    mutationFn: () => {
      const body: ApplicationInput =
        source === "git"
          ? {
              source,
              name: form.name,
              repoUrl: form.repoUrl,
              gitProviderId: providerId || null,
              autoDeploy: Boolean(providerId) && autoDeploy,
              branch: form.branch,
              dockerfilePath: form.dockerfilePath,
              port: Number(form.port),
            }
          : { source, name: form.name, image: form.image, port: Number(form.port) };
      return api<{ application: Application }>(`/api/projects/${projectId}/applications`, {
        method: "POST",
        body,
      });
    },
    onSuccess: async ({ application }) => {
      await refreshApps(application.id);
      await navigate({ to: "/apps/$appId", params: { appId: application.id } });
    },
  });

  const error = (name: string) =>
    create.error instanceof ApiRequestError ? create.error.fields[name] : undefined;
  const set = (name: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [name]: e.target.value }));

  function pick(repo: GitRepo) {
    setRepoName(repo.fullName);
    const short = repo.fullName.split("/").pop() ?? "";
    setForm((f) => ({
      ...f,
      repoUrl: repo.url,
      branch: repo.defaultBranch,
      name: f.name || short.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <div role="radiogroup" aria-label="Source" className="grid grid-cols-2 gap-2">
        {SOURCES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={source === option.value}
            onClick={() => {
              setSource(option.value);
              setForm((f) => ({ ...f, port: option.value === "git" ? "3000" : "80" }));
            }}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
              source === option.value
                ? "border-foreground ring-1 ring-foreground"
                : "hover:bg-accent",
            )}
          >
            <option.icon className="size-4" />
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground">{option.detail}</span>
          </button>
        ))}
      </div>

      {create.error &&
      !(create.error instanceof ApiRequestError && Object.keys(create.error.fields).length) ? (
        <Alert>{create.error.message}</Alert>
      ) : null}

      {source === "git" ? (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="git-account" className="text-sm leading-none font-medium">
              Account
            </label>
            <select
              id="git-account"
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setRepoName("");
                setForm((f) => ({ ...f, repoUrl: "" }));
              }}
              className={selectClass}
            >
              <option value="">Public repository (paste the URL)</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {providers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                For private repositories and deploy on push,{" "}
                <Link to="/git" className="font-medium text-foreground underline">
                  connect GitHub or GitLab
                </Link>
                .
              </p>
            ) : null}
          </div>

          {providerId ? (
            <>
              <RepoPicker providerId={providerId} selected={form.repoUrl} onPick={pick} />
              {error("repoUrl") ? (
                <p className="-mt-3 text-sm text-destructive">Pick a repository</p>
              ) : null}
            </>
          ) : (
            <Field
              label="Repository URL"
              placeholder="https://github.com/you/app.git"
              value={form.repoUrl}
              onChange={set("repoUrl")}
              error={error("repoUrl")}
              spellCheck={false}
            />
          )}
        </>
      ) : null}

      <Field
        label="Name"
        placeholder={source === "git" ? "Storefront" : "Docs site"}
        value={form.name}
        onChange={set("name")}
        error={error("name")}
      />

      {source === "git" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {branches && branches.length > 0 ? (
              <div className="flex flex-col gap-2">
                <label htmlFor="branch" className="text-sm leading-none font-medium">
                  Branch
                </label>
                <select
                  id="branch"
                  value={form.branch}
                  onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                  className={selectClass}
                >
                  {branches.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
            ) : (
              <Field
                label="Branch"
                value={form.branch}
                onChange={set("branch")}
                error={error("branch")}
              />
            )}
            <Field
              label="Dockerfile"
              value={form.dockerfilePath}
              onChange={set("dockerfilePath")}
              error={error("dockerfilePath")}
            />
          </div>
          {providerId ? (
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={autoDeploy}
                onChange={(e) => setAutoDeploy(e.target.checked)}
                className="mt-0.5 size-4 accent-foreground"
              />
              <span>
                <span className="block font-medium">Deploy on every push</span>
                <span className="text-muted-foreground">
                  Pushes to <span className="font-mono text-xs">{form.branch}</span> start a new
                  deployment.
                </span>
              </span>
            </label>
          ) : null}
        </>
      ) : (
        <Field
          label="Image"
          placeholder="nginx:alpine"
          hint="Any public image from Docker Hub or another registry."
          value={form.image}
          onChange={set("image")}
          error={error("image")}
          spellCheck={false}
        />
      )}

      <Field
        label="Port"
        hint="The port the app listens on inside the container."
        inputMode="numeric"
        value={form.port}
        onChange={set("port")}
        error={error("port")}
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create app"}
        </Button>
      </div>
    </form>
  );
}
