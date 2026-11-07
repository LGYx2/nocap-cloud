import type { AppStatus, DatabaseStatus, DeploymentStatus } from "@nocap/shared";
import { cn } from "./ui";

type Status = AppStatus | DeploymentStatus | DatabaseStatus;

const LABELS: Record<Status, string> = {
  idle: "Not deployed",
  starting: "Starting",
  building: "Building",
  queued: "Queued",
  running: "Running",
  stopped: "Stopped",
  failed: "Failed",
  rolled_back: "Rolled back",
  superseded: "Replaced",
};

function tone(status: Status): "live" | "busy" | "bad" | "quiet" {
  if (status === "running") return "live";
  if (status === "building" || status === "queued" || status === "starting") return "busy";
  if (status === "failed") return "bad";
  return "quiet";
}

/** A colored dot. Only work in progress pulses, so a page full of running apps stays still. */
export function StatusDot({ status, className }: { status: Status; className?: string }) {
  const t = tone(status);
  const color =
    t === "live"
      ? "bg-live"
      : t === "busy"
        ? "bg-busy"
        : t === "bad"
          ? "bg-destructive"
          : "bg-muted-foreground/50";
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden="true">
      {t === "busy" ? (
        <span className={cn("status-pulse absolute inset-0 rounded-full", color)} />
      ) : null}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const t = tone(status);
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        t === "live" && "border-live/30 bg-live/10 text-live",
        t === "busy" && "border-busy/30 bg-busy/10 text-busy",
        t === "bad" && "border-destructive/30 bg-destructive/10 text-destructive",
        t === "quiet" && "text-muted-foreground",
        className,
      )}
    >
      <StatusDot status={status} />
      {LABELS[status]}
    </span>
  );
}

/** A labelled usage bar, for CPU, memory and disk. */
export function Meter({ value, label, detail }: { value: number; label: string; detail: string }) {
  const percent = Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{detail}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "meter-bar h-full rounded-full transition-[width] duration-700",
            percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-busy" : "bg-foreground",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-muted-foreground tabular-nums">{percent}%</div>
    </div>
  );
}
