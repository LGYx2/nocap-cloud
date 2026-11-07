import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Dialog } from "../components/dialog";
import { BoxIcon, FolderIcon, PlusIcon, SearchIcon } from "../components/icons";
import { Alert, Button } from "../components/ui";
import { timeAgo } from "../lib/format";
import { projectsQuery } from "../queries";
import { PageHeader } from "./AppShell";
import { ProjectForm } from "./ProjectForm";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects, isPending, error } = useQuery(projectsQuery);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const visible = (projects ?? []).filter(
    (p) =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      (p.description ?? "").toLowerCase().includes(term),
  );

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <PlusIcon />
      New project
    </Button>
  );

  return (
    <>
      <PageHeader crumbs={[{ label: "Projects" }]} actions={newButton} />

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group the apps and databases that belong together.
          </p>
        </div>

        {error ? <Alert>{error.message}</Alert> : null}

        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-32 animate-pulse rounded-xl border bg-muted/50" />
            ))}
          </div>
        ) : projects && projects.length === 0 ? (
          <section className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="flex size-11 items-center justify-center rounded-lg border bg-muted">
              <FolderIcon className="size-5" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Create your first project</h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              A project holds related apps, like a website and its API. You can deploy into it once
              Git deploys arrive.
            </p>
            <div className="mt-6">{newButton}</div>
          </section>
        ) : projects ? (
          <>
            <div className="relative mb-4 max-w-sm">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects"
                aria-label="Search projects"
                className="h-9 w-full rounded-lg border border-input bg-field pr-3 pl-9 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            {visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No projects match “{search.trim()}”.
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((project) => (
                  <li key={project.id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="group flex h-full flex-col rounded-2xl border bg-card p-5 shadow-xs transition-colors hover:border-foreground/20 hover:bg-accent/40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted font-semibold uppercase">
                          {project.name[0]}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{project.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            Created {timeAgo(project.createdAt)}
                          </span>
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                        {project.description ?? "No description"}
                      </p>
                      <div className="mt-4 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                        <BoxIcon className="size-3.5" />
                        {plural(project.applicationCount, "application")}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </main>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New project"
        description="Give it a name you will recognise. You can change it later."
      >
        <ProjectForm
          onCancel={() => setCreating(false)}
          onDone={async (project) => {
            setCreating(false);
            await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
          }}
        />
      </Dialog>
    </>
  );
}
