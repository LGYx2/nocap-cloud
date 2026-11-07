import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DatabaseForm, EngineMark, engineLabel, versionLabel } from "../components/database";
import { Dialog } from "../components/dialog";
import { BoxIcon, DatabaseIcon, PlusIcon } from "../components/icons";
import { StatusBadge } from "../components/status";
import { Alert, Button } from "../components/ui";
import { timeAgo } from "../lib/format";
import { databasesQuery } from "../queries";
import { PageHeader } from "./AppShell";

export function DatabasesPage() {
  const navigate = useNavigate();
  const { data: databases = [], isPending, error } = useQuery(databasesQuery);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Databases" }]}
        actions={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon />
            New database
          </Button>
        }
      />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Databases</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PostgreSQL, MySQL, MariaDB, MongoDB and Redis in one click. Each keeps its data in its own
          volume and is reachable only by apps on this server.
        </p>

        {error ? (
          <div className="mt-6">
            <Alert>{error.message}</Alert>
          </div>
        ) : isPending ? (
          <div className="mt-6 h-32 animate-pulse rounded-2xl bg-muted/50" aria-busy="true" />
        ) : databases.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
            <div className="flex size-11 items-center justify-center rounded-lg border bg-muted">
              <DatabaseIcon className="size-5" />
            </div>
            <h2 className="mt-4 text-sm font-semibold">No databases yet</h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Create one and link it to an app. The app gets a ready connection URL, like
              DATABASE_URL, on its next deploy.
            </p>
            <Button className="mt-5" variant="outline" onClick={() => setAdding(true)}>
              <PlusIcon />
              Create a database
            </Button>
          </div>
        ) : (
          <ul className="mt-6 divide-y overflow-hidden rounded-2xl border bg-card shadow-xs">
            {databases.map((db) => (
              <li key={db.id}>
                <Link
                  to="/databases/$databaseId"
                  params={{ databaseId: db.id }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-accent/50"
                >
                  <EngineMark engine={db.engine} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{db.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {engineLabel(db.engine)} {versionLabel(db.version)} · {db.projectName}
                    </span>
                  </span>
                  <span className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground sm:flex sm:w-48">
                    <BoxIcon className="size-3.5 shrink-0" />
                    {db.links.length === 0
                      ? "Not linked"
                      : [...new Set(db.links.map((l) => l.applicationName))].join(", ")}
                  </span>
                  <span className="hidden w-28 text-right text-xs text-muted-foreground md:block">
                    {timeAgo(db.createdAt)}
                  </span>
                  <StatusBadge status={db.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="New database"
        description="It starts in the background. This takes a minute the first time, while the image downloads."
        size="lg"
      >
        <DatabaseForm
          onCancel={() => setAdding(false)}
          onDone={(db) => {
            setAdding(false);
            void navigate({ to: "/databases/$databaseId", params: { databaseId: db.id } });
          }}
        />
      </Dialog>
    </>
  );
}
