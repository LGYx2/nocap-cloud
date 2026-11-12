import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AlertSettings, Incident, MonitoredService, MonitorRange } from "@nocap/shared";
import { type FormEvent, useState } from "react";
import { api, ApiRequestError } from "../api";
import { ServiceIcon } from "../components/brand";
import { LineChart, Sparkline } from "../components/chart";
import { AlertIcon, CheckIcon } from "../components/icons";
import { ChartCard, percent, RangePicker } from "../components/metrics";
import { Panel } from "../components/panel";
import { StatusBadge } from "../components/status";
import { Alert, Button, cn, Field } from "../components/ui";
import { formatBytes, formatDuration, timeAgo } from "../lib/format";
import { alertSettingsQuery, monitoringQuery, queryClient } from "../queries";
import { PageHeader } from "./AppShell";

type ServiceStatus = Parameters<typeof StatusBadge>[0]["status"];

export function MonitoringPage() {
  const [range, setRange] = useState<MonitorRange>("1h");
  const { data, error, isPending } = useQuery(monitoringQuery(range));
  const open = data?.incidents.filter((incident) => !incident.resolvedAt) ?? [];
  const last = data?.server.points.at(-1);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Monitoring" }]}
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CPU, memory and uptime of the server and everything on it. Read once a minute, kept for 7
          days, with no extra containers.
        </p>

        {error ? (
          <div className="mt-6">
            <Alert>{error.message}</Alert>
          </div>
        ) : isPending || !data ? (
          <div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted/50" aria-busy="true" />
        ) : (
          <div className="mt-6 space-y-6">
            <div
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
                open.length ? "border-destructive/30 bg-destructive/5" : "bg-muted/40",
              )}
            >
              {open.length ? (
                <AlertIcon className="size-4 shrink-0 text-destructive" />
              ) : (
                <CheckIcon className="size-4 shrink-0 text-live" />
              )}
              {open.length
                ? `${open.length} ${open.length === 1 ? "incident is" : "incidents are"} open: ${open
                    .map((incident) => incident.title)
                    .join(", ")}.`
                : "No open incidents. Everything that should answer is answering."}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title={`Server CPU · ${data.server.cpus} cores`}
                value={last ? percent(last.cpu) : undefined}
              >
                <LineChart
                  label="Server CPU load"
                  range={range}
                  max={100}
                  points={data.server.points.map((p) => ({ t: p.t, v: p.cpu }))}
                  format={percent}
                />
              </ChartCard>
              <ChartCard
                title="Server memory"
                value={
                  last
                    ? `${formatBytes(last.memory)} of ${formatBytes(data.server.memoryTotal)}`
                    : undefined
                }
              >
                <LineChart
                  label="Server memory"
                  range={range}
                  max={data.server.memoryTotal}
                  points={data.server.points.map((p) => ({ t: p.t, v: p.memory }))}
                  format={formatBytes}
                />
              </ChartCard>
            </div>

            <ServicesTable services={data.services} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <Incidents incidents={data.incidents} services={data.services} />
              </div>
              <div className="min-w-0">
                <AlertsPanel />
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

// ---------------------------------------------------------------- services

function ServicesTable({ services }: { services: MonitoredService[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-sm font-semibold">Services</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every app and database. Open one to see its charts.
        </p>
      </div>
      {services.length === 0 ? (
        <p className="px-5 pb-8 text-sm text-muted-foreground">
          Nothing to watch yet. Deploy an app or create a database.
        </p>
      ) : (
        <ul className="divide-y border-t">
          {services.map((service) => (
            <li key={service.id}>
              <Link
                {...(service.kind === "app"
                  ? {
                      to: "/apps/$appId",
                      params: { appId: service.id },
                      search: { tab: "metrics" as const },
                    }
                  : { to: "/databases/$databaseId", params: { databaseId: service.id } })}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-accent/50"
              >
                <ServiceIcon stack={service.stack} engine={service.engine} />
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate text-sm font-medium">{service.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {service.projectName}
                  </span>
                </span>
                <span className="hidden w-28 text-xs sm:block">
                  {service.uptime != null ? (
                    <>
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          service.uptime < 99 && "text-destructive",
                        )}
                      >
                        {service.uptime}% up
                      </span>
                      <span className="block text-muted-foreground tabular-nums">
                        {service.responseMs != null ? `${service.responseMs} ms` : "no answer"}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {service.kind === "database" ? "Internal only" : "No checks yet"}
                    </span>
                  )}
                </span>
                <Sparkline
                  values={service.spark}
                  className="hidden text-muted-foreground md:block"
                />
                <span className="w-24 text-right text-xs tabular-nums">
                  {service.cpu != null && service.memory != null ? (
                    <>
                      <span className="font-medium">{percent(service.cpu)}</span>
                      <span className="block text-muted-foreground">
                        {formatBytes(service.memory)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not running</span>
                  )}
                </span>
                <StatusBadge status={service.status as ServiceStatus} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- incidents

const KIND_LABEL: Record<Incident["kind"], string> = {
  app_down: "App down",
  deploy_failed: "Deploy failed",
  server_memory: "Memory",
  server_disk: "Disk",
};

function Incidents({
  incidents,
  services,
}: {
  incidents: Incident[];
  services: MonitoredService[];
}) {
  return (
    <Panel title="Incidents" description="What went wrong in the last 30 days, newest first.">
      {incidents.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing so far. An app that stops answering, a failed deploy or a full disk shows up here.
        </p>
      ) : (
        <ul className="space-y-2">
          {incidents.map((incident) => {
            const ongoing = !incident.resolvedAt;
            const known = services.some((s) => s.id === incident.targetId);
            return (
              <li
                key={incident.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                  ongoing && "border-destructive/30 bg-destructive/5",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    ongoing ? "bg-destructive" : "bg-muted-foreground/40",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {incident.targetId && known ? (
                      <Link
                        to="/apps/$appId"
                        params={{ appId: incident.targetId }}
                        className="hover:underline"
                      >
                        {incident.title}
                      </Link>
                    ) : (
                      incident.title
                    )}
                  </p>
                  {incident.detail ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {incident.detail}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <span className="rounded-full border px-2 py-0.5">
                    {KIND_LABEL[incident.kind]}
                  </span>
                  <span className="mt-1 block">
                    {timeAgo(incident.startedAt)}
                    {incident.kind === "deploy_failed"
                      ? ""
                      : ongoing
                        ? " · ongoing"
                        : ` · ${formatDuration(
                            new Date(incident.resolvedAt ?? 0).getTime() -
                              new Date(incident.startedAt).getTime(),
                          )}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- alerts

function AlertsPanel() {
  const { data } = useQuery(alertSettingsQuery);
  const [url, setUrl] = useState("");
  const [tested, setTested] = useState(false);

  const done = ({ alerts }: { alerts: AlertSettings }) => {
    queryClient.setQueryData(alertSettingsQuery.queryKey, alerts);
    setUrl("");
  };
  const save = useMutation({
    mutationFn: (webhookUrl: string) =>
      api<{ alerts: AlertSettings }>("/api/monitoring/alerts", {
        method: "PUT",
        body: { webhookUrl },
      }),
    onSuccess: done,
  });
  const test = useMutation({
    mutationFn: () => api<{ sent: boolean }>("/api/monitoring/alerts/test", { method: "POST" }),
    onSuccess: () => {
      setTested(true);
      setTimeout(() => setTested(false), 2500);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (url.trim()) save.mutate(url.trim());
  }
  const fieldError =
    save.error instanceof ApiRequestError ? save.error.fields.webhookUrl : undefined;

  return (
    <Panel
      title="Alerts"
      description="Get a message when an app stops answering, a deploy fails or the server fills up."
    >
      {data?.webhookHost ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <CheckIcon className="size-4 shrink-0 text-live" />
          <span className="min-w-0 flex-1 truncate">
            Sending to <span className="font-mono text-xs">{data.webhookHost}</span>
          </span>
        </div>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field
          label={data?.webhookHost ? "Replace the webhook" : "Webhook address"}
          placeholder="https://hooks.slack.com/services/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={fieldError}
          hint="Slack and Discord webhooks work as they are. Any other address gets a JSON POST."
          spellCheck={false}
          autoComplete="off"
        />
        {save.error && !fieldError ? <Alert>{save.error.message}</Alert> : null}
        {test.error ? <Alert>{test.error.message}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!url.trim() || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          {data?.webhookHost ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => test.mutate()}
                disabled={test.isPending}
              >
                {tested ? <CheckIcon /> : null}
                {tested ? "Sent" : "Send a test"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => save.mutate("")}
                disabled={save.isPending}
              >
                Turn off
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}
