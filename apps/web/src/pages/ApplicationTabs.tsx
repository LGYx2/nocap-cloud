import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Application, ApplicationUpdate, Domain, EnvVar } from "@nocap/shared";
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useState } from "react";
import { api, ApiRequestError, DEMO } from "../api";
import { Dialog } from "../components/dialog";
import {
  CheckIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyIcon,
  LockIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { Alert, Button, cn, Field } from "../components/ui";
import { timeAgo } from "../lib/format";
import { domainsQuery, envQuery, queryClient, refreshApps, settingsQuery } from "../queries";

const fieldError = (error: unknown, name: string) =>
  error instanceof ApiRequestError ? error.fields[name] : undefined;

function Panel({
  title,
  description,
  children,
  footer,
  danger,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-xs",
        danger && "border-destructive/40",
      )}
    >
      <div className="p-5">
        <h3 className={cn("text-sm font-semibold", danger && "text-destructive")}>{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t bg-muted/40 px-5 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- domains

export function DomainsTab({ app }: { app: Application }) {
  const { data: domains = [], isPending } = useQuery(domainsQuery(app.id));
  const [hostname, setHostname] = useState("");

  const add = useMutation({
    mutationFn: () =>
      api<{ domain: Domain }>(`/api/applications/${app.id}/domains`, {
        method: "POST",
        body: { hostname },
      }),
    onSuccess: async () => {
      setHostname("");
      await queryClient.invalidateQueries({ queryKey: ["application", app.id, "domains"] });
      await refreshApps(app.id);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/api/domains/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["application", app.id, "domains"] });
      await refreshApps(app.id);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Panel
          title="Add a domain"
          description="Nocap routes the domain to this app and gets a free HTTPS certificate from Let's Encrypt."
        >
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Field
              label="Domain"
              className="flex-1"
              placeholder="app.example.com"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              error={fieldError(add.error, "hostname")}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="submit"
              className="sm:mt-[1.375rem]"
              disabled={!hostname || add.isPending}
            >
              <PlusIcon />
              Add
            </Button>
          </form>
          {add.error && !fieldError(add.error, "hostname") ? (
            <div className="mt-3">
              <Alert>{add.error.message}</Alert>
            </div>
          ) : null}
        </Panel>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          {isPending ? (
            <div className="h-20 animate-pulse bg-muted/50" />
          ) : domains.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <GlobeIcon className="size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No domains yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Without a domain the app runs, but only other apps on the server can reach it.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {domains.map((domain) => (
                <li key={domain.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted">
                    <LockIcon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {DEMO ? (
                      <span className="block truncate text-sm font-medium">{domain.hostname}</span>
                    ) : (
                      <a
                        href={`https://${domain.hostname}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-medium hover:underline"
                      >
                        {domain.hostname}
                        <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />
                      </a>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {DEMO
                        ? `Sample domain in the demo · added ${timeAgo(domain.createdAt)}`
                        : `HTTPS by Let's Encrypt · added ${timeAgo(domain.createdAt)}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    aria-label={`Remove ${domain.hostname}`}
                    title="Remove"
                    onClick={() => remove.mutate(domain.id)}
                    disabled={remove.isPending}
                    className="px-2.5 text-muted-foreground hover:text-destructive"
                  >
                    <TrashIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Panel
        title="Point your DNS here"
        description="Before adding a domain, create this record where you bought it."
      >
        <dl className="space-y-3 rounded-lg border bg-muted/40 p-3 font-mono text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Type</dt>
            <dd>A</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="truncate">{hostname.split(".")[0] || "app"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Value</dt>
            <dd>your server's IP</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Changes to domains apply on the next deployment. The certificate is issued on the first
          visit, which can take a few seconds.
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- environment

type Row = EnvVar & { id: number };
let nextRow = 1;
const toRows = (vars: EnvVar[]): Row[] => vars.map((v) => ({ ...v, id: nextRow++ }));

/** Reads KEY=value lines, as in a .env file. Quotes around values are removed. */
export function parseDotenv(text: string): EnvVar[] {
  const vars: EnvVar[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2] ?? "";
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    vars.push({ key: match[1] ?? "", value });
  }
  return vars;
}

export function EnvironmentTab({ app }: { app: Application }) {
  const { data, isPending, error } = useQuery(envQuery(app.id));
  const [rows, setRows] = useState<Row[]>([]);
  const [reveal, setReveal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [paste, setPaste] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setRows(toRows(data));
  }, [data]);

  const dirty =
    JSON.stringify(rows.map(({ key, value }) => ({ key, value }))) !== JSON.stringify(data ?? []);

  const save = useMutation({
    mutationFn: () =>
      api<{ vars: EnvVar[] }>(`/api/applications/${app.id}/env`, {
        method: "PUT",
        body: {
          vars: rows
            .filter((r) => r.key.trim())
            .map(({ key, value }) => ({ key: key.trim(), value })),
        },
      }),
    onSuccess: async ({ vars }) => {
      queryClient.setQueryData(envQuery(app.id).queryKey, vars);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const update = (id: number, change: Partial<EnvVar>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));

  if (error) return <Alert>{error.message}</Alert>;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Panel
          title="Environment variables"
          description="Passed to the app when it starts. Values are encrypted on the server."
          footer={
            <>
              {saved ? (
                <span className="mr-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckIcon className="size-3.5" />
                  Saved. Redeploy to apply.
                </span>
              ) : save.error ? (
                <span className="mr-auto text-sm text-destructive">{save.error.message}</span>
              ) : null}
              <Button
                variant="outline"
                onClick={() => data && setRows(toRows(data))}
                disabled={!dirty}
              >
                Discard
              </Button>
              <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setRows((r) => [...r, { id: nextRow++, key: "", value: "" }])}
            >
              <PlusIcon />
              Add variable
            </Button>
            <Button variant="outline" onClick={() => setImporting(true)}>
              Paste .env
            </Button>
            <Button variant="ghost" onClick={() => setReveal((v) => !v)} className="ml-auto">
              {reveal ? <EyeOffIcon /> : <EyeIcon />}
              {reveal ? "Hide values" : "Show values"}
            </Button>
          </div>

          {isPending ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted/50" />
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-8 text-center">
              <KeyIcon className="size-5 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No variables yet. Add one, or paste the contents of a .env file.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.id} className="flex gap-2">
                  <input
                    aria-label="Name"
                    value={row.key}
                    placeholder="NAME"
                    onChange={(e) =>
                      update(row.id, {
                        key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                      })
                    }
                    className="h-9 w-2/5 min-w-0 rounded-md border border-input bg-field px-3 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    spellCheck={false}
                  />
                  <input
                    aria-label={`Value of ${row.key || "variable"}`}
                    value={row.value}
                    type={reveal ? "text" : "password"}
                    placeholder="value"
                    onChange={(e) => update(row.id, { value: e.target.value })}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-field px-3 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <Button
                    variant="ghost"
                    aria-label={`Remove ${row.key || "variable"}`}
                    onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                    className="px-2.5 text-muted-foreground hover:text-destructive"
                  >
                    <TrashIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Good to know">
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li>Changes apply on the next deployment.</li>
          <li>
            Values are stored with AES-256-GCM using your server's master key, and never written to
            build logs.
          </li>
          <li>
            Your app reads them as normal environment variables, like{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">
              process.env.DATABASE_URL
            </code>
            .
          </li>
        </ul>
      </Panel>

      <Dialog
        open={importing}
        onClose={() => setImporting(false)}
        title="Paste a .env file"
        size="lg"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = parseDotenv(paste);
            setRows((current) => {
              const byKey = new Map(current.map((r) => [r.key, r]));
              for (const v of parsed)
                byKey.set(v.key, { ...v, id: byKey.get(v.key)?.id ?? nextRow++ });
              return [...byKey.values()];
            });
            setPaste("");
            setImporting(false);
          }}
        >
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={10}
            placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=..."}
            className="w-full rounded-md border border-input bg-field p-3 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            spellCheck={false}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setImporting(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!paste.trim()}>
              Add {parseDotenv(paste).length || ""} variables
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- settings

export function SettingsTab({ app }: { app: Application }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: app.name,
    repoUrl: app.repoUrl ?? "",
    branch: app.branch,
    dockerfilePath: app.dockerfilePath,
    image: app.image ?? "",
    port: String(app.port),
  });
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const body: ApplicationUpdate = { name: form.name, port: Number(form.port) };
      if (app.source === "git")
        Object.assign(body, {
          repoUrl: form.repoUrl,
          branch: form.branch,
          dockerfilePath: form.dockerfilePath,
        });
      else body.image = form.image;
      return api<{ application: Application }>(`/api/applications/${app.id}`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: async () => {
      await refreshApps(app.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const remove = useMutation({
    mutationFn: () => api<void>(`/api/applications/${app.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["application", app.id] });
      await refreshApps();
      await navigate({ to: "/projects/$projectId", params: { projectId: app.projectId } });
    },
  });

  const set = (name: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [name]: e.target.value }));

  return (
    <div className="space-y-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Panel
          title={app.source === "git" ? "Source and build" : "Image"}
          description="Changes apply on the next deployment."
          footer={
            <>
              {saved ? (
                <span className="mr-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckIcon className="size-3.5" />
                  Saved
                </span>
              ) : null}
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          {save.error &&
          !(save.error instanceof ApiRequestError && Object.keys(save.error.fields).length) ? (
            <div className="mb-4">
              <Alert>{save.error.message}</Alert>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              value={form.name}
              onChange={set("name")}
              error={fieldError(save.error, "name")}
            />
            <Field
              label="Port"
              hint="The port your app listens on inside the container."
              inputMode="numeric"
              value={form.port}
              onChange={set("port")}
              error={fieldError(save.error, "port")}
            />
            {app.source === "git" ? (
              <>
                <Field
                  label="Repository"
                  className="sm:col-span-2"
                  value={form.repoUrl}
                  onChange={set("repoUrl")}
                  error={fieldError(save.error, "repoUrl")}
                  spellCheck={false}
                />
                <Field
                  label="Branch"
                  value={form.branch}
                  onChange={set("branch")}
                  error={fieldError(save.error, "branch")}
                />
                <Field
                  label="Dockerfile"
                  value={form.dockerfilePath}
                  onChange={set("dockerfilePath")}
                  error={fieldError(save.error, "dockerfilePath")}
                />
              </>
            ) : (
              <Field
                label="Image"
                className="sm:col-span-2"
                value={form.image}
                onChange={set("image")}
                error={fieldError(save.error, "image")}
                spellCheck={false}
              />
            )}
          </div>
        </Panel>
      </form>

      <DeployTriggers app={app} />

      <Panel
        danger
        title="Delete this app"
        description="Stops and removes its container, deployments, domains and environment variables. It cannot be undone."
      >
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            setConfirm("");
            setDeleting(true);
          }}
        >
          <TrashIcon />
          Delete app
        </Button>
      </Panel>

      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this app?"
        description="The app goes offline right away."
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirm === app.name) remove.mutate();
          }}
        >
          {remove.error ? <Alert>{remove.error.message}</Alert> : null}
          <Field
            label={`Type ${app.name} to confirm`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={confirm !== app.name || remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete app"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- deploy triggers

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-medium">{label}</span>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <CheckIcon /> : null}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/** Deploy on push, and the deploy hook URL for any other CI. */
function DeployTriggers({ app }: { app: Application }) {
  const { data: settings } = useQuery(settingsQuery);
  const base = settings?.panelUrl ?? window.location.origin;

  const toggle = useMutation({
    mutationFn: (autoDeploy: boolean) =>
      api<{ application: Application }>(`/api/applications/${app.id}`, {
        method: "PATCH",
        body: { autoDeploy },
      }),
    onSuccess: () => refreshApps(app.id),
  });

  const reset = useMutation({
    mutationFn: () =>
      api<{ deployToken: string }>(`/api/applications/${app.id}/deploy-token`, { method: "POST" }),
    onSuccess: () => refreshApps(app.id),
  });

  return (
    <Panel
      title="Automatic deploys"
      description={
        app.gitProvider
          ? `Connected through ${app.gitProvider.name}.`
          : "This app uses a public repository URL or an image, so pushes are not watched. Use the deploy hook, or pick a connected account in a new app."
      }
    >
      <div className="space-y-5">
        {app.gitProvider ? (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={app.autoDeploy}
              disabled={toggle.isPending}
              onChange={(e) => toggle.mutate(e.target.checked)}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span>
              <span className="block font-medium">Deploy on every push</span>
              <span className="text-muted-foreground">
                Pushes to <span className="font-mono text-xs">{app.branch}</span> start a new
                deployment.
              </span>
            </span>
          </label>
        ) : null}
        <div>
          <CopyField label="Deploy hook" value={`${base}/api/hooks/deploy/${app.deployToken}`} />
          <p className="mt-2 text-xs text-muted-foreground">
            A POST to this URL deploys the app, from any CI or script:{" "}
            <code className="font-mono">curl -X POST &lt;url&gt;</code>. Keep it secret.{" "}
            <button
              type="button"
              className="font-medium text-foreground underline"
              onClick={() => reset.mutate()}
              disabled={reset.isPending}
            >
              Make a new URL
            </button>
          </p>
        </div>
      </div>
    </Panel>
  );
}
