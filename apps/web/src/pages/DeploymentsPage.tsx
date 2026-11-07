import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { DeploymentStatus } from "@nocap/shared";
import { useState } from "react";
import { RocketIcon } from "../components/icons";
import { Alert, cn } from "../components/ui";
import { deploymentsQuery } from "../queries";
import { PageHeader } from "./AppShell";
import { DeploymentRow } from "./DashboardPage";

const FILTERS: Array<{ label: string; match: (s: DeploymentStatus) => boolean }> = [
  { label: "All", match: () => true },
  { label: "In progress", match: (s) => s === "queued" || s === "building" },
  { label: "Live", match: (s) => s === "running" },
  { label: "Failed", match: (s) => s === "failed" },
];

/** Every deployment on the server, newest first. */
export function DeploymentsPage() {
  const { data = [], isPending, error } = useQuery(deploymentsQuery);
  const [filter, setFilter] = useState(0);
  const visible = data.filter((d) => FILTERS[filter]?.match(d.status) ?? true);

  return (
    <>
      <PageHeader crumbs={[{ label: "Deployments" }]} />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Deployments</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every build and release on this server. Click one to read its log.
            </p>
          </div>
          <div
            role="group"
            aria-label="Filter"
            className="inline-flex rounded-lg border p-1 text-sm"
          >
            {FILTERS.map((f, index) => {
              const count = data.filter((d) => f.match(d.status)).length;
              return (
                <button
                  key={f.label}
                  type="button"
                  aria-pressed={filter === index}
                  onClick={() => setFilter(index)}
                  className={cn(
                    "rounded-md px-3 py-1 transition-colors",
                    filter === index
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                  <span className="ml-1.5 text-xs opacity-70 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="mt-6">
            <Alert>{error.message}</Alert>
          </div>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-xl border bg-card shadow-xs">
          {isPending ? (
            <div className="h-40 animate-pulse bg-muted/50" />
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <RocketIcon className="size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Nothing here yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Deploy an app from its page in{" "}
                <Link to="/projects" className="underline">
                  Projects
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {visible.map((deployment) => (
                <DeploymentRow key={deployment.id} deployment={deployment} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
