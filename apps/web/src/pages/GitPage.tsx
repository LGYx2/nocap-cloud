import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { GitProvider } from "@nocap/shared";
import { type FormEvent, useState } from "react";
import { api, ApiRequestError, DEMO } from "../api";
import { Dialog } from "../components/dialog";
import { CheckIcon, ExternalLinkIcon, PlusIcon, RocketIcon, TrashIcon } from "../components/icons";
import { BrandIcon } from "../components/brand";
import { Alert, Button, Field } from "../components/ui";
import { timeAgo } from "../lib/format";
import { gitProvidersQuery, queryClient, settingsQuery } from "../queries";
import { PageHeader } from "./AppShell";

/** Posts the GitHub App manifest to github.com, which creates the app and comes back to us. */
function submitManifest(action: string, manifest: string) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = action;
  const field = document.createElement("input");
  field.type = "hidden";
  field.name = "manifest";
  field.value = manifest;
  form.append(field);
  document.body.append(form);
  form.submit();
}

function ConnectGithub({ onClose }: { onClose: () => void }) {
  const { data: settings } = useQuery(settingsQuery);
  const [panelUrl, setPanelUrl] = useState(settings?.panelUrl ?? window.location.origin);
  const [organization, setOrganization] = useState("");

  const start = useMutation({
    mutationFn: () =>
      api<{ action: string; manifest: string }>("/api/git-providers/github/manifest", {
        method: "POST",
        body: { panelUrl, organization: organization || undefined },
      }),
    onSuccess: async ({ action, manifest }) => {
      if (DEMO) {
        await queryClient.invalidateQueries({ queryKey: ["git-providers"] });
        onClose();
        return;
      }
      submitManifest(action, manifest);
    },
  });

  const fieldError = (name: string) =>
    start.error instanceof ApiRequestError ? start.error.fields[name] : undefined;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        start.mutate();
      }}
    >
      <ol className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">1.</span> GitHub creates a private app just
          for this server, with read-only access to code.
        </li>
        <li>
          <span className="font-medium text-foreground">2.</span> You choose which repositories it
          can see.
        </li>
        <li>
          <span className="font-medium text-foreground">3.</span> Every push to a branch deploys the
          apps that follow it.
        </li>
      </ol>
      {start.error && !fieldError("panelUrl") ? <Alert>{start.error.message}</Alert> : null}
      <Field
        label="Panel address"
        hint="GitHub sends you back here and delivers pushes to this address, so it must be reachable from the internet."
        value={panelUrl}
        onChange={(e) => setPanelUrl(e.target.value)}
        error={fieldError("panelUrl")}
        spellCheck={false}
      />
      <Field
        label="Organization (optional)"
        hint="Leave empty to create the app on your personal account."
        placeholder="my-company"
        value={organization}
        onChange={(e) => setOrganization(e.target.value)}
        error={fieldError("organization")}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={start.isPending}>
          {start.isPending ? "Opening GitHub…" : "Continue on GitHub"}
          <ExternalLinkIcon />
        </Button>
      </div>
    </form>
  );
}

function ConnectGitlab({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ baseUrl: "https://gitlab.com", token: "", name: "" });
  const add = useMutation({
    mutationFn: () =>
      api<{ provider: GitProvider }>("/api/git-providers/gitlab", {
        method: "POST",
        body: { ...form, name: form.name || undefined },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["git-providers"] });
      onClose();
    },
  });
  const fieldError = (name: string) =>
    add.error instanceof ApiRequestError ? add.error.fields[name] : undefined;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      {add.error && !fieldError("token") && !fieldError("baseUrl") ? (
        <Alert>{add.error.message}</Alert>
      ) : null}
      <Field
        label="GitLab address"
        hint="gitlab.com, or your own GitLab server."
        value={form.baseUrl}
        onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
        error={fieldError("baseUrl")}
        spellCheck={false}
      />
      <Field
        label="Personal access token"
        hint="Scopes: api (to add the push webhook) and read_repository. Stored encrypted."
        type="password"
        autoComplete="off"
        value={form.token}
        onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
        error={fieldError("token")}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!form.token || add.isPending}>
          {add.isPending ? "Checking…" : "Connect GitLab"}
        </Button>
      </div>
    </form>
  );
}

export function GitPage() {
  const search = useSearch({ from: "/app/git" });
  const navigate = useNavigate({ from: "/git" });
  const { data: providers = [], isPending, error } = useQuery(gitProvidersQuery);
  const [connecting, setConnecting] = useState<"github" | "gitlab" | null>(null);
  const [removing, setRemoving] = useState<GitProvider | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/api/git-providers/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ["git-providers"] });
    },
  });

  const dismiss = () => void navigate({ search: {} });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Git providers" }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setConnecting("gitlab")}>
              <PlusIcon />
              GitLab
            </Button>
            <Button onClick={() => setConnecting("github")}>
              <PlusIcon />
              Connect GitHub
            </Button>
          </>
        }
      />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Git providers</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Connect GitHub or GitLab to deploy private repositories and to deploy automatically on
          every push. Public repositories work without an account.
        </p>

        {search.installed ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-live/30 bg-live/10 p-4 text-sm">
            <CheckIcon className="mt-0.5 size-4 text-live" />
            <div className="flex-1">
              <p className="font-medium">GitHub is connected.</p>
              <p className="text-muted-foreground">
                Create an app and pick a repository from the list. Pushes to its branch deploy it.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {search.error ? (
          <div className="mt-6">
            <Alert>{search.error}</Alert>
          </div>
        ) : null}
        {error ? (
          <div className="mt-6">
            <Alert>{error.message}</Alert>
          </div>
        ) : null}

        {isPending ? (
          <div className="mt-6 h-32 animate-pulse rounded-xl bg-muted/50" />
        ) : providers.length === 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              {
                type: "github" as const,
                title: "GitHub",
                text: "Creates a private GitHub App for this server in two clicks. Read-only access to the repositories you choose.",
              },
              {
                type: "gitlab" as const,
                title: "GitLab",
                text: "gitlab.com or your own GitLab. Uses a personal access token, stored encrypted.",
              },
            ].map((option) => (
              <button
                key={option.type}
                type="button"
                onClick={() => setConnecting(option.type)}
                className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
              >
                <span className="flex size-10 items-center justify-center rounded-lg border bg-muted">
                  <BrandIcon name={option.type} className="size-5" />
                </span>
                <span className="text-base font-semibold">Connect {option.title}</span>
                <span className="text-sm text-muted-foreground">{option.text}</span>
              </button>
            ))}
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {providers.map((provider) => (
              <li
                key={provider.id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card px-5 py-4 shadow-xs"
              >
                <span className="flex size-10 items-center justify-center rounded-lg border bg-muted">
                  <BrandIcon name={provider.type} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {provider.type === "github" ? "GitHub App" : "GitLab token"} · connected{" "}
                    {timeAgo(provider.createdAt)}
                    {provider.type === "github" && !provider.installed ? (
                      <span className="ml-2 text-destructive">
                        Not installed on any account yet
                      </span>
                    ) : null}
                  </p>
                </div>
                {provider.installUrl && !DEMO ? (
                  <a
                    href={provider.installUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent"
                  >
                    Choose repositories
                    <ExternalLinkIcon />
                  </a>
                ) : null}
                <Button
                  variant="ghost"
                  aria-label={`Disconnect ${provider.name}`}
                  onClick={() => setRemoving(provider)}
                  className="px-2.5 text-muted-foreground hover:text-destructive"
                >
                  <TrashIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Deploy on push",
              text: "Apps follow a branch. A push to it starts a deployment, and you can watch it live.",
            },
            {
              title: "Private repositories",
              text: "Code is cloned with short-lived tokens that never appear in logs or images.",
            },
            {
              title: "Any other CI",
              text: "Every app also has a deploy hook URL in its Settings, for Bitbucket, Gitea or a script.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border p-5">
              <RocketIcon className="size-4 text-muted-foreground" />
              <h3 className="mt-3 text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </section>
      </main>

      <Dialog
        open={connecting === "github"}
        onClose={() => setConnecting(null)}
        title="Connect GitHub"
        description={DEMO ? "In the demo this adds a sample account." : undefined}
        size="lg"
      >
        <ConnectGithub onClose={() => setConnecting(null)} />
      </Dialog>
      <Dialog
        open={connecting === "gitlab"}
        onClose={() => setConnecting(null)}
        title="Connect GitLab"
        description={DEMO ? "In the demo any token longer than 10 characters works." : undefined}
        size="lg"
      >
        <ConnectGitlab onClose={() => setConnecting(null)} />
      </Dialog>
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Disconnect this account?"
        description="Apps that use it keep their settings but cannot clone private code or deploy on push until you connect again."
      >
        {remove.error ? <Alert>{remove.error.message}</Alert> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => removing && remove.mutate(removing.id)}
          >
            Disconnect
          </Button>
        </div>
      </Dialog>
    </>
  );
}
