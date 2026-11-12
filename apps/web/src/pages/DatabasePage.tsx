import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import type { DatabaseAction, ManagedDatabase } from "@nocap/shared";
import { DATABASE_ENGINES } from "@nocap/shared/catalog";
import { type FormEvent, useState } from "react";
import { api, ApiRequestError } from "../api";
import { CodeValue } from "../components/code";
import { EngineMark, engineLabel, versionLabel } from "../components/database";
import { Dialog } from "../components/dialog";
import {
  BoxIcon,
  EyeIcon,
  EyeOffIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
  TrashIcon,
} from "../components/icons";
import { MetricsPanel } from "../components/metrics";
import { CopyButton, Panel } from "../components/panel";
import { StatusBadge } from "../components/status";
import { Terminal } from "../components/terminal";
import { Alert, Button, cn, Field } from "../components/ui";
import { timeAgo } from "../lib/format";
import {
  databaseConnectionQuery,
  databaseLogsQuery,
  databaseQuery,
  projectApplicationsQuery,
  queryClient,
  refreshDatabases,
} from "../queries";
import { PageHeader } from "./AppShell";

export function DatabasePage() {
  const { databaseId } = useParams({ from: "/app/databases/$databaseId" });
  const { data: db, error, isPending } = useQuery(databaseQuery(databaseId));

  const action = useMutation({
    mutationFn: (name: DatabaseAction) =>
      api<{ database: ManagedDatabase }>(`/api/databases/${databaseId}/actions/${name}`, {
        method: "POST",
      }),
    onSuccess: () => refreshDatabases(),
  });

  const crumbs = [
    { label: "Databases", to: "/databases" },
    ...(db ? [{ label: db.projectName, to: `/projects/${db.projectId}` }] : []),
    { label: db?.name ?? "Database" },
  ];

  if (error) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
          <Alert>{error.message}</Alert>
        </main>
      </>
    );
  }

  const starting = db?.status === "starting";

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        actions={
          db ? (
            db.status === "running" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => action.mutate("restart")}
                  disabled={action.isPending}
                >
                  <RefreshIcon />
                  <span className="hidden sm:inline">Restart</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => action.mutate("stop")}
                  disabled={action.isPending}
                >
                  <StopIcon />
                  <span className="hidden sm:inline">Stop</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={() => action.mutate("start")}
                disabled={action.isPending || starting}
              >
                <PlayIcon />
                {starting ? "Starting" : db.status === "failed" ? "Try again" : "Start"}
              </Button>
            )
          ) : null
        }
      />

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        {isPending || !db ? (
          <div className="h-32 animate-pulse rounded-xl bg-muted/50" aria-busy="true" />
        ) : (
          <>
            {action.error ? (
              <div className="mb-4">
                <Alert>{action.error.message}</Alert>
              </div>
            ) : null}

            <div className="flex flex-wrap items-start gap-4">
              <EngineMark engine={db.engine} className="size-12 rounded-xl text-sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{db.name}</h1>
                  <StatusBadge status={db.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {engineLabel(db.engine)} {versionLabel(db.version)} · in{" "}
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: db.projectId }}
                    className="font-medium text-foreground hover:underline"
                  >
                    {db.projectName}
                  </Link>{" "}
                  · created {timeAgo(db.createdAt)}
                </p>
              </div>
            </div>

            {db.status === "failed" && db.error ? (
              <div className="mt-6">
                <Alert>{db.error}</Alert>
              </div>
            ) : null}
            {starting ? (
              <p className="mt-6 rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Downloading the image and starting the database. The first time this takes about a
                minute.
              </p>
            ) : null}

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="min-w-0 space-y-6 lg:col-span-2">
                <ConnectionPanel db={db} />
                <LinksPanel db={db} />
                <Panel title="Metrics">
                  <MetricsPanel targetId={db.id} uptime={false} />
                </Panel>
                <LogsPanel db={db} />
              </div>
              <div className="min-w-0 space-y-6">
                <Panel title="Good to know">
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li>
                      Only containers on this server can reach it. It has no public port, so it
                      cannot be scanned from the internet.
                    </li>
                    <li>
                      Data lives in a Docker volume, so it survives restarts, redeploys and updates
                      of Nocap.
                    </li>
                    <li>Linked apps get the connection URL on their next deploy.</li>
                  </ul>
                </Panel>
                <DeletePanel db={db} />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

// ---------------------------------------------------------------- connection

function ConnectionPanel({ db }: { db: ManagedDatabase }) {
  const [reveal, setReveal] = useState(false);
  const connection = useQuery({ ...databaseConnectionQuery(db.id), enabled: reveal });
  const secret = reveal ? connection.data : undefined;

  const rows: Array<[string, string]> = [
    ["Host", db.host],
    ["Port", String(db.port)],
    ...(db.engine === "redis" ? [] : ([["Database", db.dbName]] as Array<[string, string]>)),
    ["User", db.username],
  ];

  return (
    <Panel
      title="Connection"
      description="For apps on this server. Linking an app fills this in for you."
    >
      <dl className="divide-y rounded-lg border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn("truncate font-mono text-xs", label === "Host" && "text-code-info")}>
              {value}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
          <dt className="text-muted-foreground">Password</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <span className={cn("truncate font-mono text-xs", secret && "text-code-warn")}>
              {secret ? secret.password : "••••••••••••••••"}
            </span>
            <Button
              variant="ghost"
              className="h-7 px-2"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide password" : "Show password"}
            >
              {reveal ? <EyeOffIcon /> : <EyeIcon />}
            </Button>
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <span className="text-sm leading-none font-medium">Connection URL</span>
        <div className="mt-2 flex gap-2">
          {secret ? (
            <CodeValue value={secret.url} />
          ) : (
            <code className="block min-w-0 flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              {DATABASE_ENGINES[db.engine].variable}=… (show the password to see it)
            </code>
          )}
          {secret ? <CopyButton value={secret.url} /> : null}
        </div>
        {connection.error ? (
          <p className="mt-2 text-sm text-destructive">{connection.error.message}</p>
        ) : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- links

function LinksPanel({ db }: { db: ManagedDatabase }) {
  const { data: apps = [] } = useQuery(projectApplicationsQuery(db.projectId));
  const suggested = DATABASE_ENGINES[db.engine].variable;
  const [appId, setAppId] = useState("");
  const [variable, setVariable] = useState(suggested);
  const target = appId || apps[0]?.id || "";

  const link = useMutation({
    mutationFn: () =>
      api<{ database: ManagedDatabase }>(`/api/databases/${db.id}/links`, {
        method: "POST",
        body: { applicationId: target, variable },
      }),
    onSuccess: async () => {
      setVariable(suggested);
      await refreshDatabases();
    },
  });

  const unlink = useMutation({
    mutationFn: (id: string) => api<void>(`/api/database-links/${id}`, { method: "DELETE" }),
    onSuccess: () => refreshDatabases(),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (target) link.mutate();
  }

  const variableError =
    link.error instanceof ApiRequestError ? link.error.fields.variable : undefined;

  return (
    <Panel
      title="Used by"
      description="A linked app gets the connection URL as an environment variable. Redeploy it to apply."
    >
      {db.links.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {db.links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <BoxIcon className="size-4 shrink-0 text-muted-foreground" />
              <Link
                to="/apps/$appId"
                params={{ appId: l.applicationId }}
                className="min-w-0 truncate text-sm font-medium hover:underline"
              >
                {l.applicationName}
              </Link>
              <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                {l.variable}
              </span>
              <Button
                variant="ghost"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                onClick={() => unlink.mutate(l.id)}
                disabled={unlink.isPending}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {apps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No apps in {db.projectName} yet.{" "}
          <Link
            to="/projects/$projectId"
            params={{ projectId: db.projectId }}
            className="font-medium text-foreground underline"
          >
            Add one
          </Link>{" "}
          to link it.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="link-app" className="text-sm leading-none font-medium">
              App
            </label>
            <select
              id="link-app"
              value={target}
              onChange={(e) => setAppId(e.target.value)}
              className="h-9 rounded-lg border border-input bg-field px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="As variable"
            className="flex-1"
            value={variable}
            onChange={(e) => setVariable(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
            error={variableError}
            spellCheck={false}
            autoComplete="off"
          />
          <Button
            type="submit"
            className="sm:mt-[1.375rem]"
            disabled={!target || !variable || link.isPending}
          >
            Link
          </Button>
        </form>
      )}
      {link.error && !variableError ? (
        <div className="mt-3">
          <Alert>{link.error.message}</Alert>
        </div>
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------- logs

function LogsPanel({ db }: { db: ManagedDatabase }) {
  const [follow, setFollow] = useState(false);
  const { data, isPending } = useQuery(databaseLogsQuery(db.id, follow));
  return (
    <Panel title="Logs" description="The last 200 lines from the database container.">
      <label className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={follow}
          onChange={(e) => setFollow(e.target.checked)}
          className="size-4 accent-foreground"
        />
        Refresh every 5 seconds
      </label>
      <Terminal
        text={data?.logs ?? ""}
        title={db.host}
        live={follow && Boolean(data?.running)}
        empty={isPending ? "Loading…" : "No output yet."}
        className="max-h-80"
      />
    </Panel>
  );
}

// ---------------------------------------------------------------- delete

function DeletePanel({ db }: { db: ManagedDatabase }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [keepData, setKeepData] = useState(false);

  const remove = useMutation({
    mutationFn: () =>
      api<void>(`/api/databases/${db.id}${keepData ? "?keepData=true" : ""}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["databases", "one", db.id] });
      await refreshDatabases();
      await navigate({ to: "/databases" });
    },
  });

  return (
    <>
      <Panel
        danger
        title="Delete this database"
        description={
          db.links.length > 0
            ? "Unlink every app first, so none of them loses its database by surprise."
            : "Stops the container and deletes all its data."
        }
      >
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={db.links.length > 0}
          onClick={() => {
            setConfirm("");
            setKeepData(false);
            setOpen(true);
          }}
        >
          <TrashIcon />
          Delete database
        </Button>
      </Panel>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this database?"
        description="The container goes away and so does all its data, unless you keep the volume below."
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirm === db.name) remove.mutate();
          }}
        >
          {remove.error ? <Alert>{remove.error.message}</Alert> : null}
          <Field
            label={`Type ${db.name} to confirm`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={keepData}
              onChange={(e) => setKeepData(e.target.checked)}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span>
              <span className="block font-medium">Keep the data volume</span>
              <span className="text-muted-foreground">
                The volume stays on the server, so the data can be recovered with Docker.
              </span>
            </span>
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={confirm !== db.name || remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete database"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
