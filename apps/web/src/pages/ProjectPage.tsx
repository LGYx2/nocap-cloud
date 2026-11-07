import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { api } from "../api";
import { Dialog } from "../components/dialog";
import {
  BoxIcon,
  GitBranchIcon,
  GlobeIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { StatusBadge, StatusDot } from "../components/status";
import { Alert, Button, Field } from "../components/ui";
import { formatDate, timeAgo } from "../lib/format";
import { projectApplicationsQuery, projectQuery, queryClient } from "../queries";
import { ApplicationForm } from "./ApplicationForm";
import { PageHeader } from "./AppShell";
import { ProjectForm } from "./ProjectForm";

export function ProjectPage() {
  const { projectId } = useParams({ from: "/app/projects/$projectId" });
  const navigate = useNavigate();
  const { data: project, isPending, error } = useQuery(projectQuery(projectId));
  const { data: apps = [] } = useQuery(projectApplicationsQuery(projectId));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const remove = useMutation({
    mutationFn: () => api<void>(`/api/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["projects", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects"], exact: true });
      await navigate({ to: "/projects" });
    },
  });

  function submitDelete(event: FormEvent) {
    event.preventDefault();
    if (project && confirmName === project.name) remove.mutate();
  }

  const crumbs = [{ label: "Projects", to: "/projects" }, { label: project?.name ?? "Project" }];

  if (error) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
          <Alert>{error.message}</Alert>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        actions={
          project ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmName("");
                  setDeleting(true);
                }}
                className="text-destructive hover:text-destructive"
              >
                <TrashIcon />
                Delete
              </Button>
            </>
          ) : null
        }
      />

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        {isPending || !project ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted/50" aria-busy="true" />
        ) : (
          <>
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-muted text-lg font-semibold uppercase">
                {project.name[0]}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {project.description ?? "No description"}
                </p>
              </div>
            </div>

            <dl className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Applications", value: String(project.applicationCount) },
                { label: "Created", value: formatDate(project.createdAt) },
                { label: "Last change", value: timeAgo(project.updatedAt) },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border bg-card p-4 shadow-xs">
                  <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 text-xl font-semibold tracking-tight">{item.value}</dd>
                </div>
              ))}
            </dl>

            <section className="mt-8">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Applications</h2>
                <div className="flex items-center gap-2">
                  <Link
                    to="/deployments"
                    search={{ project: project.id }}
                    className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent"
                  >
                    Deployments
                  </Link>
                  <Button onClick={() => setAdding(true)}>
                    <PlusIcon />
                    New application
                  </Button>
                </div>
              </div>
              {apps.length === 0 ? (
                <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
                  <div className="flex size-11 items-center justify-center rounded-lg border bg-muted">
                    <BoxIcon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">No applications yet</h3>
                  <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                    Add an app from a Git repository with a Dockerfile, or from a Docker image. It
                    gets its own domain, HTTPS and environment variables.
                  </p>
                  <Button className="mt-5" variant="outline" onClick={() => setAdding(true)}>
                    <PlusIcon />
                    Add the first app
                  </Button>
                </div>
              ) : (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {apps.map((app) => (
                    <li key={app.id}>
                      <Link
                        to="/apps/$appId"
                        params={{ appId: app.id }}
                        className="flex h-full flex-col rounded-xl border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                              {app.source === "image" ? (
                                <ImageIcon className="size-4" />
                              ) : (
                                <GitBranchIcon className="size-4" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{app.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {app.source === "git"
                                  ? `${app.repoUrl?.replace(/^https:\/\/(www\.)?/, "").replace(/\.git$/, "")} · ${app.branch}`
                                  : app.image}
                              </span>
                            </span>
                          </div>
                          <StatusDot status={app.status} className="mt-1.5" />
                        </div>
                        <div className="mt-4 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <GlobeIcon className="size-3.5 shrink-0" />
                          {app.domains[0] ?? "No domain yet"}
                          {app.domains.length > 1 ? ` +${app.domains.length - 1}` : ""}
                        </div>
                        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                          <StatusBadge status={app.status} />
                          <span>
                            {app.lastDeployment
                              ? `Deployed ${timeAgo(app.lastDeployment.createdAt)}`
                              : "Never deployed"}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      {project ? (
        <>
          <Dialog
            open={adding}
            onClose={() => setAdding(false)}
            title="New application"
            description={`Add an app to ${project.name}. You can deploy it right after.`}
            size="lg"
          >
            <ApplicationForm projectId={project.id} onCancel={() => setAdding(false)} />
          </Dialog>

          <Dialog open={editing} onClose={() => setEditing(false)} title="Edit project">
            <ProjectForm
              project={project}
              onCancel={() => setEditing(false)}
              onDone={() => setEditing(false)}
            />
          </Dialog>

          <Dialog
            open={deleting}
            onClose={() => setDeleting(false)}
            title="Delete this project?"
            description="This deletes the project and every application in it. It cannot be undone."
          >
            <form className="flex flex-col gap-5" onSubmit={submitDelete}>
              {remove.error ? <Alert>{remove.error.message}</Alert> : null}
              <Field
                label={`Type ${project.name} to confirm`}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                autoComplete="off"
                autoFocus
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setDeleting(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={confirmName !== project.name || remove.isPending}
                >
                  {remove.isPending ? "Deleting…" : "Delete project"}
                </Button>
              </div>
            </form>
          </Dialog>
        </>
      ) : null}
    </>
  );
}
