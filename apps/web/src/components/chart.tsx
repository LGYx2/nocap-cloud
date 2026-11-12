// Small SVG charts drawn by hand: no chart library to download.
import { type PointerEvent, useState } from "react";
import type { MonitorRange, UptimePoint } from "@nocap/shared";
import { cn } from "./ui";

export interface ChartPoint {
  t: number;
  v: number;
}

const W = 600;

export function timeLabel(t: number, range: MonitorRange): string {
  const date = new Date(t);
  return range === "7d"
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit" }) + "h"
    : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** A line with a soft fill. Hover or touch shows the value at that time. */
export function LineChart({
  points,
  range,
  format,
  max,
  height = 120,
  label,
}: {
  points: ChartPoint[];
  range: MonitorRange;
  format: (value: number) => string;
  /** Top of the scale. Defaults to a little above the highest value. */
  max?: number;
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground"
        style={{ height }}
      >
        {points.length === 0
          ? "No data yet. Readings are taken once a minute."
          : "Collecting data…"}
      </div>
    );
  }

  const first = points[0]?.t ?? 0;
  const span = Math.max(1, (points.at(-1)?.t ?? 1) - first);
  const top = max ?? Math.max(...points.map((p) => p.v), 0.0001) * 1.2;
  const x = (t: number) => ((t - first) / span) * W;
  const y = (v: number) => height - 2 - (Math.min(v, top) / top) * (height - 6);
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join("");
  const active = hover === null ? null : (points[hover] ?? null);

  function move(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const at = first + ((event.clientX - box.left) / box.width) * span;
    let best = 0;
    for (let i = 1; i < points.length; i += 1) {
      if (Math.abs((points[i]?.t ?? 0) - at) < Math.abs((points[best]?.t ?? 0) - at)) best = i;
    }
    setHover(best);
  }

  return (
    <div>
      <div
        className="relative touch-pan-y"
        style={{ height }}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          role="img"
          aria-label={`${label}, now ${format(points.at(-1)?.v ?? 0)}`}
        >
          {[0.25, 0.5, 0.75].map((share) => (
            <line
              key={share}
              x1="0"
              x2={W}
              y1={height * share}
              y2={height * share}
              stroke="var(--border)"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={`${line}L${W},${height}L0,${height}Z`} fill="var(--foreground)" opacity="0.07" />
          <path
            d={line}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {active ? (
            <line
              x1={x(active.t)}
              x2={x(active.t)}
              y1="0"
              y2={height}
              stroke="var(--muted-foreground)"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {active ? (
          <>
            <span
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
              style={{ left: `${(x(active.t) / W) * 100}%`, top: y(active.v) }}
            />
            <span
              className={cn(
                "pointer-events-none absolute top-1 z-10 rounded-lg border bg-background px-2 py-1 text-[11px] whitespace-nowrap shadow-sm",
                x(active.t) > W / 2 ? "-translate-x-full" : "",
              )}
              style={{
                left: `calc(${(x(active.t) / W) * 100}% + ${x(active.t) > W / 2 ? -8 : 8}px)`,
              }}
            >
              <span className="font-medium tabular-nums">{format(active.v)}</span>
              <span className="ml-1.5 text-muted-foreground">{timeLabel(active.t, range)}</span>
            </span>
          </>
        ) : null}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{timeLabel(first, range)}</span>
        <span>{timeLabel(points.at(-1)?.t ?? first, range)}</span>
      </div>
    </div>
  );
}

/** A tiny line for table rows. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <span className={cn("inline-block h-6 w-20", className)} />;
  const top = Math.max(...values, 0.0001);
  const d = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${((i / (values.length - 1)) * 80).toFixed(1)},${(22 - (v / top) * 20).toFixed(1)}`,
    )
    .join("");
  return (
    <svg viewBox="0 0 80 24" className={cn("h-6 w-20", className)} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** One block per time slot: blue when every check got an answer, red when none did. */
export function UptimeBar({ checks, range }: { checks: UptimePoint[]; range: MonitorRange }) {
  if (checks.length === 0) {
    return (
      <div className="flex h-8 items-center justify-center rounded-lg bg-muted/40 text-xs text-muted-foreground">
        No checks yet
      </div>
    );
  }
  return (
    <div
      className="flex h-8 gap-px overflow-hidden rounded-lg"
      role="img"
      aria-label="Uptime checks"
    >
      {checks.map((check) => (
        <span
          key={check.t}
          title={`${timeLabel(check.t, range)}: ${
            check.up === 1 ? "up" : check.up === 0 ? "down" : `${Math.round(check.up * 100)}% up`
          }${check.ms != null ? `, ${check.ms} ms` : ""}`}
          className={cn(
            "min-w-0 flex-1",
            check.up === 1 ? "bg-live/70" : check.up === 0 ? "bg-destructive" : "bg-busy",
          )}
        />
      ))}
    </div>
  );
}
