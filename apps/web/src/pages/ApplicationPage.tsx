import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import type { AppAction, Application, Deployment } from "@nocap/shared";
import { useState } from "react";
import { api } from "../api";
import { Dialog } from "../components/dialog";
import {
  BoxIcon,
  ClockIcon,
  CommitIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GlobeIcon,
  ImageIcon,
  KeyIcon,
  PlayIcon,
  RefreshIcon,
  RocketIcon,
  SettingsIcon,
  SpinnerIcon,
  StopIcon,
  TerminalIcon,
} from "../components/icons";
import { StatusBadge } from "../components/status";
import { DeploymentLogView, Terminal } from "../components/terminal";
import { Alert, Button, cn } from "../components/ui";
import { deploymentDuration, timeAgo } from "../lib/format";
import {
  appLogsQuery,
  applicationDeploymentsQuery,
  applicationQuery,
  refreshApps,
} from "../queries";
import { PageHeader } from "./AppShell";
import { DomainsTab, EnvironmentTab, SettingsTab } from "./ApplicationTabs";

export const APP_TABS = ["deployments", "logs", "domains", "environment", "settings"] as const;
export type AppTab = (typeof APP_TABS)[number];

const TAB_META: Record<AppTab, { label: string; icon: typeof RocketIcon }> = {
  deployments: { label: "Deployments", icon: RocketIcon },
  logs: { label: "Logs", icon: TerminalIcon },
  domains: { label: "Domains", icon: GlobeIcon },
  environment: { label: "Environment", icon: KeyIcon },
  settings: { label: "Settings", icon: SettingsIcon },
};

const busy = (status: string) => status === "building" || status === "queued";

export function ApplicationPage() {
  const { appId } = useParams({ from: "/app/apps/$appId" });
  const search = useSearch({ from: "/app/apps/$appId" });
  const navigate = useNavigate({ from: "/apps/$appId" });
  const tab: AppTab = search.tab ?? "deployments";
  const { data: app, error, isPending } = useQuery(applicationQuery(appId));

  const setTab = (next: AppTab) =>
    void navigate({
      search: (prev) => ({ ...prev, tab: next === "deployments" ? undefined : next }),
    });
  const openDeployment = (id: string | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, deployment: id }) });

  const deploy = useMutation({
    mutationFn: () =>
      api<{ deployment: Deployment }>(`/api/applications/${appId}/deploy`, { method: "POST" }),
    onSuccess: async () => {
      // The live log shows at the top of the Deployments tab.
      await refreshApps(appId);
      void navigate({ search: { tab: undefined, deployment: undefined } });
    },
  });

  const action = useMutation({
    mutationFn: (name: AppAction) =>
      api<{ application: Application }>(`/api/applications/${appId}/actions/${name}`, {
        method: "POST",
      }),
    onSuccess: () => refreshApps(appId),
  });

  const crumbs = [
    { label: "Projects", to: "/projects" },
    ...(app ? [{ label: app.projectName, to: `/projects/${app.projectId}` }] : []),
    { label: app?.name ?? "Application" },
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

  const deploying = app ? busy(app.status) : false;
  const url = app?.domains[0] ? `https://${app.domains[0]}` : null;

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        actions={
          app ? (
            <>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent sm:inline-flex"
                >
                  <ExternalLinkIcon />
                  Open
                </a>
              ) : null}
              {app.status === "stopped" ? (
                <Button
                  variant="outline"
                  onClick={() => action.mutate("start")}
                  disabled={action.isPending}
                >
                  <PlayIcon />
                  Start
                </Button>
              ) : app.lastDeployment ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => action.mutate("restart")}
                    disabled={action.isPending || deploying}
                    title="Restart the running container"
                  >
                    <RefreshIcon />
                    <span className="hidden sm:inline">Restart</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => action.mutate("stop")}
                    disabled={action.isPending || deploying || app.status !== "running"}
                    title="Stop the app"
                  >
                    <StopIcon />
                    <span className="hidden sm:inline">Stop</span>
                  </Button>
                </>
              ) : null}
              <Button onClick={() => deploy.mutate()} disabled={deploy.isPending || deploying}>
                {deploying ? <SpinnerIcon /> : <RocketIcon />}
                {deploying ? "Deploying" : app.lastDeployment ? "Redeploy" : "Deploy"}
              </Button>
            </>
          ) : null
        }
      />

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        {isPending || !app ? (
          <div className="h-32 animate-pulse rounded-xl bg-muted/50" aria-busy="true" />
        ) : (
          <>
            {deploy.error || action.error ? (
              <div className="mb-4">
                <Alert>{(deploy.error ?? action.error)?.message}</Alert>
              </div>
            ) : null}

            <div className="flex flex-wrap items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-muted">
                {app.source === "image" ? (
                  <ImageIcon className="size-5" />
                ) : (
                  <BoxIcon className="size-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{app.name}</h1>
                  <StatusBadge status={app.status} />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {app.source === "git" ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <GitBranchIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{app.repoUrl?.replace(/^https:\/\//, "")}</span>
                      <span className="rounded border px-1.5 font-mono text-xs">{app.branch}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                      <ImageIcon className="size-3.5" />
                      {app.image}
                    </span>
                  )}
                  {app.domains.map((domain) => (
                    <a
                      key={domain}
                      href={`https://${domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
                    >
                      <GlobeIcon className="size-3.5" />
                      {domain}
                    </a>
                  ))}
                </p>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                {
                  label: "Last deployment",
                  value: app.lastDeployment ? timeAgo(app.lastDeployment.createdAt) : "Never",
                  icon: ClockIcon,
                },
                {
                  label: "Commit",
                  value:
                    app.lastDeployment?.commitSha?.slice(0, 7) ??
                    (app.source === "image" ? "Image" : "None"),
                  icon: CommitIcon,
                  mono: true,
                },
                { label: "Port", value: String(app.port), icon: TerminalIcon, mono: true },
                {
                  label: "Domains",
                  value: app.domains.length ? String(app.domains.length) : "None",
                  icon: GlobeIcon,
                },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border bg-card p-4 shadow-xs">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <item.icon className="size-3.5" />
                    {item.label}
                  </dt>
                  <dd
                    className={cn(
                      "mt-1.5 truncate text-lg font-semibold tracking-tight",
                      item.mono && "font-mono",
                    )}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div
              role="tablist"
              aria-label="Application sections"
              className="mt-8 flex gap-1 overflow-x-auto border-b"
            >
              {APP_TABS.map((name) => {
                const meta = TAB_META[name];
                const active = tab === name;
                return (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(name)}
                    className={cn(
                      "-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
                      active
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <meta.icon className="size-3.5" />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-6" role="tabpanel">
              {tab === "deployments" ? (
                <DeploymentsTab
                  app={app}
                  onOpen={openDeployment}
                  onDeploy={() => deploy.mutate()}
                />
              ) : tab === "logs" ? (
                <LogsTab app={app} />
              ) : tab === "domains" ? (
                <DomainsTab app={app} />
              ) : tab === "environment" ? (
                <EnvironmentTab app={app} />
              ) : (
                <SettingsTab app={app} />
              )}
            </div>
          </>
        )}
      </main>

      {app ? (
        <Dialog
          open={Boolean(search.deployment)}
          onClose={() => openDeployment(undefined)}
          title="Deployment log"
          description={`${app.name} · ${search.deployment?.slice(0, 8) ?? ""}`}
          size="xl"
        >
          {search.deployment ? (
            <DeploymentLogView deploymentId={search.deployment} applicationId={app.id} />
          ) : null}
        </Dialog>
      ) : null}
    </>
  );
}

function DeploymentsTab({
  app,
  onOpen,
  onDeploy,
}: {
  app: Application;
  onOpen: (id: string) => void;
  onDeploy: () => void;
}) {
  const live = busy(app.status);
  const { data: deployments = [], isPending } = useQuery(applicationDeploymentsQuery(app.id, live));
  const active = deployments.find((d) => busy(d.status));

  if (isPending) return <div className="h-40 animate-pulse rounded-xl bg-muted/50" />;

  if (deployments.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
        <span className="flex size-11 items-center justify-center rounded-lg border bg-muted">
          <RocketIcon className="size-5" />
        </span>
        <h3 className="mt-4 text-sm font-semibold">Ready for the first deployment</h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {app.source === "git"
            ? "Nocap clones the repository, builds the Dockerfile and starts the app. You can watch every step live."
            : "Nocap pulls the image and starts it. You can watch every step live."}
        </p>
        <Button className="mt-5" onClick={onDeploy}>
          <RocketIcon />
          Deploy now
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {active ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <SpinnerIcon className="size-3.5" />
              Deploying now
            </h3>
            <span className="text-xs text-muted-foreground">
              Started {active.startedAt ? timeAgo(active.startedAt) : "in a moment"}
            </span>
          </div>
          <DeploymentLogView deploymentId={active.id} applicationId={app.id} />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Change</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Duration</th>
              <th className="px-4 py-2.5 text-right font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {deployments.map((d) => (
              <tr
                key={d.id}
                onClick={() => onOpen(d.id)}
                className="cursor-pointer transition-colors hover:bg-accent/60"
              >
                <td className="px-4 py-3">
                  <StatusBadge status={d.status} />
                </td>
                <td className="max-w-0 px-4 py-3">
                  <button
                    type="button"
                    className="block w-full truncate text-left font-medium"
                    onClick={() => onOpen(d.id)}
                  >
                    {d.commitMessage ?? (d.imageTag ? d.imageTag : "Deployment")}
                  </button>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.commitSha ? (
                      <span className="font-mono">{d.commitSha.slice(0, 7)} · </span>
                    ) : null}
                    {d.error ?? (d.trigger === "redeploy" ? "Redeploy" : "Manual deploy")}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground tabular-nums md:table-cell">
                  {deploymentDuration(d.startedAt, d.finishedAt) ?? "Waiting"}
                </td>
                <td className="px-4 py-3 text-right text-xs whitespace-nowrap text-muted-foreground">
                  {timeAgo(d.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-muted-foreground">
        Click a deployment to see its full build log. Older deployments are kept for reference.{" "}
        <Link to="/deployments" className="underline">
          All deployments
        </Link>
      </p>
    </div>
  );
}

function LogsTab({ app }: { app: Application }) {
  const [follow, setFollow] = useState(true);
  const { data, isFetching, refetch } = useQuery(appLogsQuery(app.id, follow));

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">App output</h3>
          <p className="text-xs text-muted-foreground">
            The last 300 lines your app printed.{" "}
            {data && !data.running ? "The app is not running." : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => setFollow(e.target.checked)}
              className="size-4 accent-foreground"
            />
            Follow
          </label>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshIcon className={cn("size-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>
      <Terminal
        text={data?.logs ?? ""}
        empty={
          app.lastDeployment
            ? "The app has not printed anything yet."
            : "Deploy the app to see its output here."
        }
        className="max-h-[36rem] min-h-72"
      />
    </section>
  );
}
