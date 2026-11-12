import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { MonitoredService, Overview } from "@nocap/shared";
import { DATABASE_ENGINES, STACKS } from "@nocap/shared/catalog";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { ServiceIcon } from "../components/brand";
import { LineChart, Sparkline } from "../components/chart";
import { DeploymentRow } from "../components/deployment-row";
import {
  ActivityIcon,
  AlertIcon,
  ArrowRightIcon,
  BoxIcon,
  DatabaseIcon,
  FolderIcon,
  PlusIcon,
  RocketIcon,
} from "../components/icons";
import { percent } from "../components/metrics";
import { Meter, StatusDot } from "../components/status";
import { Alert, cn } from "../components/ui";
import { formatBytes, formatUptime, greeting, timeAgo } from "../lib/format";
import { meQuery, monitoringQuery, overviewQuery } from "../queries";
import { PageHeader } from "./AppShell";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;
type DotStatus = Parameters<typeof StatusDot>[0]["status"];

function Card({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-card shadow-sm", className)}>
      {title ? (
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Deployments per day as bars; the failed part of each day is drawn in red. */
function ActivityChart({ activity }: { activity: Overview["activity"] }) {
  const max = Math.max(1, ...activity.map((d) => d.total));
  const total = activity.reduce((sum, d) => sum + d.total, 0);
  const failed = activity.reduce((sum, d) => sum + d.failed, 0);
  const label = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div className="px-5 pb-5">
      <div className="flex items-end gap-6">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{total}</div>
          <div className="text-xs text-muted-foreground">deployments</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {total ? Math.round(((total - failed) / total) * 100) : 100}%
          </div>
          <div className="text-xs text-muted-foreground">succeeded</div>
        </div>
      </div>
      <div
        className="mt-5 flex h-32 items-end gap-1.5"
        role="img"
        aria-label={`${total} deployments in the last 14 days, ${failed} failed`}
      >
        {activity.map((d) => {
          const height = (d.total / max) * 100;
          const failedShare = d.total ? (d.failed / d.total) * 100 : 0;
          return (
            <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-md bg-foreground/80 transition-colors group-hover:bg-foreground"
                style={{
                  height: `${Math.max(height, d.total ? 6 : 2)}%`,
                  opacity: d.total ? 1 : 0.15,
                }}
              >
                {d.failed ? (
                  <div className="w-full bg-destructive" style={{ height: `${failedShare}%` }} />
                ) : null}
              </div>
              <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg border bg-background px-2 py-1 text-[11px] whitespace-nowrap shadow-sm group-hover:block">
                {label(d.date)}: {d.total}
                {d.failed ? `, ${d.failed} failed` : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{activity[0] ? label(activity[0].date) : ""}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/** One number in the summary strip. */
function Stat({
  icon: Icon,
  label,
  value,
  detail,
  to,
  bad,
  className,
}: {
  icon: IconType;
  label: string;
  value: ReactNode;
  detail: string;
  to: string;
  bad?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex min-w-0 flex-col gap-1 bg-card px-5 py-4 transition-colors hover:bg-accent",
        className,
      )}
    >
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={cn("size-3.5", bad && "text-destructive")} />
        {label}
      </span>
      <span
        className={cn(
          "text-2xl font-semibold tracking-tight tabular-nums",
          bad && "text-destructive",
        )}
      >
        {value}
      </span>
      <span className="truncate text-xs text-muted-foreground">{detail}</span>
    </Link>
  );
}

/** Apps and databases grouped by project, each with its real icon and live usage. */
function Services({ services }: { services: MonitoredService[] }) {
  const projects = new Map<string, { name: string; items: MonitoredService[] }>();
  for (const service of services) {
    const group = projects.get(service.projectId) ?? { name: service.projectName, items: [] };
    group.items.push(service);
    projects.set(service.projectId, group);
  }
  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 pt-2 pb-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted">
          <BoxIcon className="size-5" />
        </span>
        <p className="mt-3 text-sm font-medium">Nothing running yet</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Create a project, then add an app from Git or a Docker image and a database for it.
        </p>
      </div>
    );
  }
  return (
    <div className="pb-2">
      {[...projects.entries()].map(([projectId, group]) => (
        <div key={projectId} className="border-t first:border-t-0">
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="flex items-center gap-2 px-5 pt-3 pb-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <FolderIcon className="size-3.5" />
            {group.name}
            <span className="tabular-nums">· {group.items.length}</span>
          </Link>
          <ul className="px-2 pb-2">
            {group.items.map((service) => (
              <li key={service.id}>
                <Link
                  {...(service.kind === "app"
                    ? { to: "/apps/$appId", params: { appId: service.id } }
                    : { to: "/databases/$databaseId", params: { databaseId: service.id } })}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-accent/70"
                >
                  <ServiceIcon stack={service.stack} engine={service.engine} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{service.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {service.engine
                        ? DATABASE_ENGINES[service.engine].label
                        : service.stack
                          ? STACKS[service.stack]
                          : "App"}
                    </span>
                  </span>
                  <Sparkline
                    values={service.spark}
                    className="hidden text-muted-foreground/70 sm:block"
                  />
                  <span className="w-20 text-right text-xs tabular-nums">
                    {service.cpu != null && service.memory != null ? (
                      <>
                        <span className="font-medium">{percent(service.cpu)}</span>
                        <span className="block text-muted-foreground">
                          {formatBytes(service.memory)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground capitalize">
                        {service.status === "idle" ? "Not deployed" : service.status}
                      </span>
                    )}
                  </span>
                  <StatusDot status={service.status as DotStatus} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { data: user } = useQuery(meQuery);
  const { data, error, isPending } = useQuery(overviewQuery);
  const { data: monitoring } = useQuery(monitoringQuery("1h"));
  const firstName = user?.name.split(" ")[0] ?? "";
  const viewAll =
    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground";

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard" }]} />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        {error ? (
          <div className="mb-6">
            <Alert>{error.message}</Alert>
          </div>
        ) : null}

        {isPending || !data ? (
          <div className="grid gap-4" aria-busy="true">
            <div className="h-24 animate-pulse rounded-2xl border bg-muted/50" />
            <div className="h-80 animate-pulse rounded-2xl border bg-muted/50" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Title, server facts and the two things people do most */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  {greeting()}
                  {firstName ? `, ${firstName}` : ""}
                </p>
                <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Overview</h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{data.server.hostname}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      !data.docker.available && "text-destructive",
                    )}
                  >
                    <StatusDot status={data.docker.available ? "running" : "failed"} />
                    {data.docker.available
                      ? `Docker ${data.docker.version ?? ""}`
                      : "Docker not reachable"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{data.docker.containersRunning} containers</span>
                  <span aria-hidden="true">·</span>
                  <span>up {formatUptime(data.server.uptime)}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  to="/projects"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3.5 text-sm font-medium shadow-xs hover:bg-accent"
                >
                  <PlusIcon />
                  New app
                </Link>
                <Link
                  to="/deployments"
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
                >
                  <RocketIcon />
                  Deployments
                </Link>
              </div>
            </div>

            {/* Shown only when something needs a look */}
            {data.counts.incidents || data.counts.failed ? (
              <Link
                to={data.counts.incidents ? "/monitoring" : "/deployments"}
                className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm transition-colors hover:bg-destructive/10"
              >
                <AlertIcon className="size-4 shrink-0 text-destructive" />
                <span className="flex-1">
                  {[
                    data.counts.incidents
                      ? `${data.counts.incidents} open ${data.counts.incidents === 1 ? "incident" : "incidents"}`
                      : null,
                    data.counts.failed
                      ? `${data.counts.failed} ${data.counts.failed === 1 ? "app" : "apps"} with a failed deployment`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" and ")}
                  .
                </span>
                <ArrowRightIcon className="size-4 shrink-0 text-destructive" />
              </Link>
            ) : null}

            {/* Numbers, in one strip */}
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-sm sm:grid-cols-5">
              <Stat
                icon={BoxIcon}
                label="Applications"
                value={
                  <>
                    {data.counts.running}
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      / {data.counts.applications}
                    </span>
                  </>
                }
                detail="running"
                to="/projects"
              />
              <Stat
                icon={DatabaseIcon}
                label="Databases"
                value={data.counts.databases}
                detail={
                  data.counts.databases === 1 ? "one click, linked to apps" : "linked to apps"
                }
                to="/databases"
              />
              <Stat
                icon={RocketIcon}
                label="Deploys today"
                value={data.deploymentsToday}
                detail={
                  data.recentDeployments[0]
                    ? `last ${timeAgo(data.recentDeployments[0].createdAt)}`
                    : "none yet"
                }
                to="/deployments"
              />
              <Stat
                icon={ActivityIcon}
                label="Open incidents"
                value={data.counts.incidents}
                detail={data.counts.incidents ? "needs a look" : "all answering"}
                to="/monitoring"
                bad={data.counts.incidents > 0}
              />
              <Stat
                icon={FolderIcon}
                label="Projects"
                value={data.counts.projects}
                detail="groups of services"
                to="/projects"
                className="col-span-2 sm:col-span-1"
              />
            </section>

            {/* What runs here, and how the server is doing */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card
                title="Services"
                subtitle="Apps and databases, with CPU and memory now"
                className="min-w-0 lg:col-span-2"
                action={
                  <Link to="/projects" className={viewAll}>
                    Projects <ArrowRightIcon className="size-3" />
                  </Link>
                }
              >
                <Services services={monitoring?.services ?? []} />
              </Card>

              <Card
                title="Server"
                subtitle={`${data.server.platform} · ${data.server.cpus} cores`}
                className="min-w-0"
                action={
                  <Link to="/monitoring" className={viewAll}>
                    Monitoring <ArrowRightIcon className="size-3" />
                  </Link>
                }
              >
                <div className="space-y-5 px-5 pt-1 pb-5">
                  <Meter
                    label="CPU"
                    value={data.server.load}
                    detail={`load on ${data.server.cpus} cores`}
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
                  <div className="border-t pt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">CPU, last hour</p>
                    <LineChart
                      label="Server CPU load, last hour"
                      range="1h"
                      max={100}
                      height={72}
                      points={(monitoring?.server.points ?? []).map((p) => ({ t: p.t, v: p.cpu }))}
                      format={percent}
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* Recent work */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card
                title="Recent deployments"
                className="min-w-0 lg:col-span-2"
                action={
                  <Link to="/deployments" className={viewAll}>
                    View all <ArrowRightIcon className="size-3" />
                  </Link>
                }
              >
                {data.recentDeployments.length === 0 ? (
                  <div className="flex flex-col items-center px-6 pt-4 pb-10 text-center">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                      <RocketIcon className="size-5" />
                    </span>
                    <p className="mt-3 text-sm font-medium">No deployments yet</p>
                    <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                      Create a project, add an app from Git or a Docker image, and deploy it.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5 px-2 pb-3">
                    {data.recentDeployments.slice(0, 6).map((deployment) => (
                      <DeploymentRow key={deployment.id} deployment={deployment} />
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Deployments" subtitle="Last 14 days" className="min-w-0">
                <ActivityChart activity={data.activity} />
              </Card>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
