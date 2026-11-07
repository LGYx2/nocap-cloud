import { Link } from "@tanstack/react-router";
import type { Deployment } from "@nocap/shared";
import { deploymentDuration, timeAgo } from "../lib/format";
import { AlertIcon, CheckIcon, ClockIcon, CommitIcon, RocketIcon } from "./icons";
import { StatusBadge } from "./status";
import { cn } from "./ui";

/** One deployment in a list: status, app, commit, when and how long. Opens its build log. */
export function DeploymentRow({
  deployment,
  showApp = true,
  card = false,
}: {
  deployment: Deployment;
  showApp?: boolean;
  /** Draw the row as its own rounded card, for full-page lists. */
  card?: boolean;
}) {
  const duration = deploymentDuration(deployment.startedAt, deployment.finishedAt);
  const icon =
    deployment.status === "failed" ? (
      <AlertIcon className="size-4" />
    ) : deployment.status === "running" ? (
      <CheckIcon className="size-4" />
    ) : deployment.status === "building" || deployment.status === "queued" ? (
      <RocketIcon className="size-4" />
    ) : (
      <ClockIcon className="size-4" />
    );
  return (
    <Link
      to="/apps/$appId"
      params={{ appId: deployment.applicationId }}
      search={{ deployment: deployment.id }}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/70",
        card &&
          "rounded-2xl border bg-card px-4 py-3 shadow-xs transition-all hover:-translate-y-px hover:border-foreground/20 hover:bg-card hover:shadow-md",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl border",
          deployment.status === "failed" &&
            "border-destructive/30 bg-destructive/10 text-destructive",
          deployment.status === "running" && "border-live/30 bg-live/10 text-live",
          (deployment.status === "building" || deployment.status === "queued") &&
            "border-busy/30 bg-busy/10 text-busy",
          (deployment.status === "superseded" || deployment.status === "rolled_back") &&
            "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          {showApp ? (
            <span className="truncate font-medium">{deployment.applicationName}</span>
          ) : null}
          {deployment.commitSha ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">
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
      <div className="hidden shrink-0 sm:block">
        <StatusBadge status={deployment.status} />
      </div>
      <div className="w-24 shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        <div>{timeAgo(deployment.createdAt)}</div>
        {duration ? <div>{duration}</div> : null}
      </div>
    </Link>
  );
}
