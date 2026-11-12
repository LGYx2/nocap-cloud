import { useQuery } from "@tanstack/react-query";
import type { MonitorRange } from "@nocap/shared";
import { useState } from "react";
import { formatBytes } from "../lib/format";
import { serviceSeriesQuery } from "../queries";
import { LineChart, UptimeBar } from "./chart";
import { cn } from "./ui";

const RANGES: Array<{ value: MonitorRange; label: string }> = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
];

export function RangePicker({
  value,
  onChange,
}: {
  value: MonitorRange;
  onChange: (range: MonitorRange) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-lg border p-0.5">
      {RANGES.map((range) => (
        <button
          key={range.value}
          type="button"
          role="radio"
          aria-checked={value === range.value}
          onClick={() => onChange(range.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
            value === range.value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

export const percent = (value: number) => `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;

export function ChartCard({
  title,
  value,
  children,
}: {
  title: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-xs">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {value ? <span className="text-sm font-medium tabular-nums">{value}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** CPU and memory over time for one app or database, and uptime checks for apps. */
export function MetricsPanel({ targetId, uptime }: { targetId: string; uptime: boolean }) {
  const [range, setRange] = useState<MonitorRange>("1h");
  const { data } = useQuery(serviceSeriesQuery(targetId, range));
  const points = data?.points ?? [];
  const last = points.at(-1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          One reading a minute, kept for 7 days. CPU is a percent of one core.
        </p>
        <RangePicker value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="CPU" value={last ? percent(last.cpu) : undefined}>
          <LineChart
            label="CPU"
            range={range}
            points={points.map((p) => ({ t: p.t, v: p.cpu }))}
            format={percent}
          />
        </ChartCard>
        <ChartCard title="Memory" value={last ? formatBytes(last.memory) : undefined}>
          <LineChart
            label="Memory"
            range={range}
            points={points.map((p) => ({ t: p.t, v: p.memory }))}
            format={formatBytes}
          />
        </ChartCard>
      </div>
      {uptime ? (
        <ChartCard
          title="Uptime"
          value={
            data?.uptime != null
              ? `${data.uptime}%${data.responseMs != null ? ` · ${data.responseMs} ms` : ""}`
              : undefined
          }
        >
          <UptimeBar checks={data?.checks ?? []} range={range} />
          <p className="mt-2 text-xs text-muted-foreground">
            Every minute Nocap asks the app for an answer on its port. Two misses in a row open an
            incident and send an alert.
          </p>
        </ChartCard>
      ) : null}
    </div>
  );
}
