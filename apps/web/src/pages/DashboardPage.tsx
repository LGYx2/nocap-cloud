import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Overview } from "@nocap/shared";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { DeploymentRow } from "../components/deployment-row";
import {
  ActivityIcon,
  AlertIcon,
  ArrowRightIcon,
  BoxIcon,
  CheckIcon,
  ClockIcon,
  FolderIcon,
  GitBranchIcon,
  GlobeIcon,
  ImageIcon,
  PlusIcon,
  RocketIcon,
  ServerIcon,
} from "../components/icons";
import { StatusDot } from "../components/status";
import { Alert, cn } from "../components/ui";
import { formatBytes, formatUptime, greeting, timeAgo } from "../lib/format";
import { allApplicationsQuery, meQuery, overviewQuery } from "../queries";
import { PageHeader } from "./AppShell";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

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

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  to,
}: {
  icon: IconType;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: "bad" | "live";
  to?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-xl bg-muted",
          tone === "bad" && "bg-destructive/10 text-destructive",
          tone === "live" && "bg-live/10 text-live",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 text-sm font-medium">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </>
  );
  const className =
    "group relative block overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all";
  return to ? (
    <Link to={to} className={cn(className, "hover:-translate-y-0.5 hover:shadow-md")}>
      {body}
      <ArrowRightIcon className="absolute top-5 right-5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** A ring that fills with the share used, for CPU, memory and disk. */
function Ring({ value, label, detail }: { value: number; label: string; detail: string }) {
  const percent = Math.min(100, Math.max(0, Math.round(value * 100)));
  const r = 34;
  const length = 2 * Math.PI * r;
  const color =
    percent >= 90
      ? "var(--destructive)"
      : percent >= 75
        ? "oklch(0.6 0.2 295)"
        : "var(--foreground)";
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative size-24">
        <svg
          viewBox="0 0 80 80"
          className="size-24 -rotate-90"
          role="meter"
          aria-label={label}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--muted)" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${(percent / 100) * length} ${length}`}
            className="transition-[stroke-dasharray] duration-700"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums">
          {percent}%
        </span>
      </div>
      <span className="mt-2 text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{detail}</span>
    </div>
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

export function DashboardPage() {
  const { data: user } = useQuery(meQuery);
  const { data, error, isPending } = useQuery(overviewQuery);
  const { data: apps = [] } = useQuery(allApplicationsQuery);
  const firstName = user?.name.split(" ")[0] ?? "";

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
            <div className="h-40 animate-pulse rounded-2xl border bg-muted/50" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl border bg-muted/50" />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Welcome and health */}
            <section className="relative overflow-hidden rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-foreground/[0.04] blur-2xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent_60%)]"
              />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{greeting()}</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                    {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
                  </h1>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-3">
                      <ServerIcon className="size-3.5 text-muted-foreground" />
                      {data.server.hostname}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-7 items-center gap-2 rounded-full border bg-background px-3",
                        !data.docker.available && "border-destructive/30 text-destructive",
                      )}
                    >
                      <StatusDot status={data.docker.available ? "running" : "failed"} />
                      {data.docker.available
                        ? `Docker ${data.docker.version ?? ""}`
                        : "Docker not reachable"}
                    </span>
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-3">
                      <ClockIcon className="size-3.5 text-muted-foreground" />
                      Up {formatUptime(data.server.uptime)}
                    </span>
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-3">
                      <ActivityIcon className="size-3.5 text-muted-foreground" />
                      {data.docker.containersRunning} containers
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/projects"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent"
                  >
                    <PlusIcon />
                    New app
                  </Link>
                  <Link
                    to="/deployments"
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
                  >
                    <RocketIcon />
                    Deployments
                  </Link>
                </div>
              </div>
              <div
                className={cn(
                  "relative mt-6 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
                  data.counts.failed ? "border-destructive/30 bg-destructive/5" : "bg-muted/40",
                )}
              >
                {data.counts.failed ? (
                  <AlertIcon className="size-4 shrink-0 text-destructive" />
                ) : (
                  <CheckIcon className="size-4 shrink-0 text-live" />
                )}
                <span className="flex-1">
                  {data.counts.failed
                    ? `${data.counts.failed} ${data.counts.failed === 1 ? "app needs" : "apps need"} attention: the last deployment failed.`
                    : data.counts.applications
                      ? "All apps are healthy."
                      : "No apps yet. Create a project and add your first app."}
                </span>
                {data.counts.failed ? (
                  <Link
                    to="/deployments"
                    className="text-xs font-medium whitespace-nowrap underline"
                  >
                    See failures
                  </Link>
                ) : null}
              </div>
            </section>

            {/* Numbers */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatCard
                icon={FolderIcon}
                label="Projects"
                value={data.counts.projects}
                detail="Groups of apps"
                to="/projects"
              />
              <StatCard
                icon={BoxIcon}
                label="Applications"
                value={data.counts.applications}
                detail={`${data.counts.running} running`}
                tone={data.counts.running ? "live" : undefined}
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
                to="/deployments"
              />
              <StatCard
                icon={AlertIcon}
                label="Need attention"
                value={data.counts.failed}
                detail={data.counts.failed ? "Last deploy failed" : "Everything is fine"}
                tone={data.counts.failed ? "bad" : undefined}
              />
            </div>

            {/* Activity and server */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Card title="Deployments" subtitle="Last 14 days" className="lg:col-span-2">
                <ActivityChart activity={data.activity} />
              </Card>
              <Card title="Server" subtitle={`${data.server.platform} · ${data.server.cpus} cores`}>
                <div className="grid grid-cols-3 gap-2 px-4 pt-2 pb-6">
                  <Ring label="CPU" value={data.server.load} detail={`${data.server.cpus} cores`} />
                  <Ring
                    label="Memory"
                    value={data.server.memory.used / data.server.memory.total}
                    detail={formatBytes(data.server.memory.total)}
                  />
                  {data.server.disk ? (
                    <Ring
                      label="Disk"
                      value={data.server.disk.used / data.server.disk.total}
                      detail={formatBytes(data.server.disk.total)}
                    />
                  ) : null}
                </div>
                <div className="mx-5 mb-5 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-muted/50 px-3 py-2">
                    <div className="text-muted-foreground">Memory used</div>
                    <div className="mt-0.5 font-medium tabular-nums">
                      {formatBytes(data.server.memory.used)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-muted/50 px-3 py-2">
                    <div className="text-muted-foreground">Disk used</div>
                    <div className="mt-0.5 font-medium tabular-nums">
                      {data.server.disk ? formatBytes(data.server.disk.used) : "n/a"}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Recent work and apps */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Card
                title="Recent deployments"
                className="lg:col-span-2"
                action={
                  <Link
                    to="/deployments"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
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
                    {data.recentDeployments.map((deployment) => (
                      <DeploymentRow key={deployment.id} deployment={deployment} />
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title="Applications"
                action={
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {apps.length}
                  </span>
                }
              >
                {apps.length === 0 ? (
                  <p className="px-5 pb-8 text-center text-sm text-muted-foreground">
                    Apps you add to your projects show up here.
                  </p>
                ) : (
                  <ul className="space-y-0.5 px-2 pb-3">
                    {apps.slice(0, 7).map((app) => (
                      <li key={app.id}>
                        <Link
                          to="/apps/$appId"
                          params={{ appId: app.id }}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/70"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                            {app.source === "image" ? (
                              <ImageIcon className="size-4" />
                            ) : (
                              <GitBranchIcon className="size-4" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{app.name}</span>
                            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <GlobeIcon className="size-3 shrink-0" />
                              {app.domains[0] ?? app.projectName}
                            </span>
                          </span>
                          <StatusDot status={app.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
