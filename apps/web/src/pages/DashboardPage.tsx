import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Deployment } from "@nocap/shared";
import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  ActivityIcon,
  AlertIcon,
  ArrowRightIcon,
  BookIcon,
  BoxIcon,
  CommitIcon,
  CpuIcon,
  DiskIcon,
  ExternalLinkIcon,
  FolderIcon,
  GlobeIcon,
  MemoryIcon,
  RocketIcon,
  ServerIcon,
} from "../components/icons";
import { Meter, StatusBadge, StatusDot } from "../components/status";
import { Alert, cn } from "../components/ui";
import { deploymentDuration, formatBytes, formatUptime, greeting, timeAgo } from "../lib/format";
import { allApplicationsQuery, meQuery, overviewQuery } from "../queries";
import { PageHeader } from "./AppShell";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: IconType;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: "bad";
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border bg-background",
            tone === "bad" && "border-destructive/30 text-destructive",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function Card({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-xs", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DeploymentRow({
  deployment,
  showApp = true,
}: {
  deployment: Deployment;
  showApp?: boolean;
}) {
  const duration = deploymentDuration(deployment.startedAt, deployment.finishedAt);
  return (
    <Link
      to="/apps/$appId"
      params={{ appId: deployment.applicationId }}
      search={{ deployment: deployment.id }}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/60"
    >
      <StatusDot status={deployment.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          {showApp ? (
            <span className="truncate font-medium">{deployment.applicationName}</span>
          ) : null}
          {deployment.commitSha ? (
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground">
              <CommitIcon className="size-3" />
              {deployment.commitSha.slice(0, 7)}
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {deployment.error ??
            deployment.commitMessage ??
            (deployment.imageTag ? `Image ${deployment.imageTag}` : "Manual deployment")}
        </p>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <StatusBadge status={deployment.status} />
      </div>
      <div className="w-28 shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        <div>{timeAgo(deployment.createdAt)}</div>
        {duration ? <div>{duration}</div> : null}
      </div>
    </Link>
  );
}

export function DashboardPage() {
  const { data: user } = useQuery(meQuery);
  const { data, error, isPending } = useQuery(overviewQuery);
  const { data: apps = [] } = useQuery(allApplicationsQuery);

  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard" }]} />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data ? (
                <>
                  Here is what is running on{" "}
                  <span className="font-medium text-foreground">{data.server.hostname}</span>.
                </>
              ) : (
                "Loading your server…"
              )}
            </p>
          </div>
          {data ? (
            <span
              className={cn(
                "inline-flex h-7 items-center gap-2 rounded-full border px-3 text-xs font-medium",
                data.docker.available
                  ? "text-foreground"
                  : "border-destructive/30 text-destructive",
              )}
            >
              <StatusDot status={data.docker.available ? "running" : "failed"} />
              {data.docker.available
                ? `Docker ${data.docker.version ?? ""}`
                : "Docker not reachable"}
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="mt-6">
            <Alert>{error.message}</Alert>
          </div>
        ) : null}

        {isPending || !data ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/50" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={FolderIcon}
                label="Projects"
                value={data.counts.projects}
                detail={
                  <Link to="/projects" className="hover:underline">
                    View all projects
                  </Link>
                }
              />
              <StatCard
                icon={BoxIcon}
                label="Applications"
                value={data.counts.applications}
                detail={`${data.counts.running} running`}
              />
              <StatCard
                icon={RocketIcon}
                label="Deployments today"
                value={data.deploymentsToday}
                detail={
                  data.recentDeployments[0]
                    ? `Last ${timeAgo(data.recentDeployments[0].createdAt)}`
                    : "None yet"
                }
              />
              <StatCard
                icon={AlertIcon}
                label="Need attention"
                value={data.counts.failed}
                detail={
                  data.counts.failed ? "Apps whose last deploy failed" : "Everything is healthy"
                }
                tone={data.counts.failed ? "bad" : undefined}
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <Card
                title="Recent deployments"
                className="lg:col-span-2"
                action={
                  <Link
                    to="/deployments"
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    View all <ArrowRightIcon className="size-3" />
                  </Link>
                }
              >
                {data.recentDeployments.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-12 text-center">
                    <span className="flex size-10 items-center justify-center rounded-lg border bg-muted">
                      <RocketIcon className="size-5" />
                    </span>
                    <p className="mt-3 text-sm font-medium">No deployments yet</p>
                    <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                      Create a project, add an app from a Git repository or a Docker image, and
                      deploy it.
                    </p>
                    <Link
                      to="/projects"
                      className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Go to projects
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y">
                    {data.recentDeployments.map((deployment) => (
                      <DeploymentRow key={deployment.id} deployment={deployment} />
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title="Server"
                action={
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ServerIcon className="size-3.5" />
                    up {formatUptime(data.server.uptime)}
                  </span>
                }
              >
                <div className="space-y-5 p-5">
                  <Meter
                    label="CPU load"
                    value={data.server.load}
                    detail={`${data.server.cpus} ${data.server.cpus === 1 ? "core" : "cores"}`}
                  />
                  <Meter
                    label="Memory"
                    value={data.server.memory.used / data.server.memory.total}
                    detail={`${formatBytes(data.server.memory.used)} of ${formatBytes(data.server.memory.total)}`}
                  />
                  {data.server.disk ? (
                    <Meter
                      label="Disk"
                      value={data.server.disk.used / data.server.disk.total}
                      detail={`${formatBytes(data.server.disk.used)} of ${formatBytes(data.server.disk.total)}`}
                    />
                  ) : null}
                  <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-xs">
                    <div className="flex items-center gap-2">
                      <CpuIcon className="size-3.5 text-muted-foreground" />
                      <dd className="truncate">{data.server.platform}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <ActivityIcon className="size-3.5 text-muted-foreground" />
                      <dd>{data.docker.containersRunning} containers</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <MemoryIcon className="size-3.5 text-muted-foreground" />
                      <dd>{formatBytes(data.server.memory.total)} RAM</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <DiskIcon className="size-3.5 text-muted-foreground" />
                      <dd>{data.server.disk ? formatBytes(data.server.disk.total) : "n/a"} disk</dd>
                    </div>
                  </dl>
                </div>
              </Card>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <Card
                title="Applications"
                className="lg:col-span-2"
                action={
                  <span className="text-xs text-muted-foreground">
                    {apps.length} {apps.length === 1 ? "app" : "apps"}
                  </span>
                }
              >
                {apps.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Apps you add to your projects show up here.
                  </p>
                ) : (
                  <ul className="grid gap-px overflow-hidden rounded-b-xl bg-border sm:grid-cols-2">
                    {apps.slice(0, 6).map((app) => (
                      <li key={app.id} className="bg-card">
                        <Link
                          to="/apps/$appId"
                          params={{ appId: app.id }}
                          className="flex h-full flex-col gap-2 p-4 transition-colors hover:bg-accent/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{app.name}</span>
                            <StatusBadge status={app.status} />
                          </div>
                          <span className="truncate text-xs text-muted-foreground">
                            {app.projectName}
                          </span>
                          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <GlobeIcon className="size-3 shrink-0" />
                            {app.domains[0] ?? "No domain"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Get started">
                <ul className="divide-y text-sm">
                  {[
                    {
                      to: "/projects",
                      label: "Create a project",
                      detail: "Group apps that belong together",
                      icon: FolderIcon,
                    },
                    {
                      to: "/deployments",
                      label: "Watch deployments",
                      detail: "Live build logs for every app",
                      icon: RocketIcon,
                    },
                  ].map((item) => (
                    <li key={item.label}>
                      <Link
                        to={item.to}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-accent/60"
                      >
                        <item.icon className="size-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{item.label}</span>
                          <span className="block text-xs text-muted-foreground">{item.detail}</span>
                        </span>
                        <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                  <li>
                    <a
                      href="https://nocapcloud.click/docs"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-accent/60"
                    >
                      <BookIcon className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">Read the docs</span>
                        <span className="block text-xs text-muted-foreground">
                          Domains, HTTPS and env vars
                        </span>
                      </span>
                      <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                    </a>
                  </li>
                </ul>
              </Card>
            </div>
          </>
        )}
      </main>
    </>
  );
}
