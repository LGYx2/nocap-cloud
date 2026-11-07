import { useMutation, useQuery } from "@tanstack/react-query";
import type { DatabaseEngine, ManagedDatabase } from "@nocap/shared";
import { DATABASE_ENGINE_IDS, DATABASE_ENGINES } from "@nocap/shared/catalog";
import { type FormEvent, useState } from "react";
import { api, ApiRequestError } from "../api";
import { projectsQuery, refreshDatabases } from "../queries";
import { Alert, Button, cn, Field } from "./ui";

const MARKS: Record<DatabaseEngine, string> = {
  postgres: "PG",
  mysql: "MY",
  mariadb: "MA",
  mongodb: "MO",
  redis: "RD",
};

/** A small monogram tile per engine. Text only, so no logos to download. */
export function EngineMark({ engine, className }: { engine: DatabaseEngine; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted font-mono text-[11px] font-semibold tracking-tight",
        className,
      )}
    >
      {MARKS[engine]}
    </span>
  );
}

export const engineLabel = (engine: DatabaseEngine) => DATABASE_ENGINES[engine].label;

/** "17-alpine" reads as "17". */
export const versionLabel = (version: string) => version.replace(/-alpine$/, "");

const fieldError = (error: unknown, name: string) =>
  error instanceof ApiRequestError ? error.fields[name] : undefined;

/** Create a database. Without a projectId it asks which project it belongs to. */
export function DatabaseForm({
  projectId,
  onCancel,
  onDone,
}: {
  projectId?: string;
  onCancel: () => void;
  onDone: (database: ManagedDatabase) => void;
}) {
  const { data: projects = [] } = useQuery({ ...projectsQuery, enabled: !projectId });
  const [engine, setEngine] = useState<DatabaseEngine>("postgres");
  const [project, setProject] = useState(projectId ?? "");
  const [name, setName] = useState("");
  const [version, setVersion] = useState(DATABASE_ENGINES.postgres.versions[0] ?? "");
  const [dbName, setDbName] = useState("app");
  const target = projectId || project || projects[0]?.id || "";

  const create = useMutation({
    mutationFn: () =>
      api<{ database: ManagedDatabase }>(`/api/projects/${target}/databases`, {
        method: "POST",
        body: {
          name: name.trim() || DATABASE_ENGINES[engine].label,
          engine,
          version,
          ...(engine === "redis" ? {} : { dbName }),
        },
      }),
    onSuccess: async ({ database }) => {
      await refreshDatabases();
      onDone(database);
    },
  });

  function pick(next: DatabaseEngine) {
    setEngine(next);
    setVersion(DATABASE_ENGINES[next].versions[0] ?? "");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (target) create.mutate();
  }

  const info = DATABASE_ENGINES[engine];

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      {create.error &&
      !(create.error instanceof ApiRequestError && Object.keys(create.error.fields).length) ? (
        <Alert>{create.error.message}</Alert>
      ) : null}

      <fieldset>
        <legend className="text-sm leading-none font-medium">Database</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DATABASE_ENGINE_IDS.map((id) => (
            <label
              key={id}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-sm transition-colors",
                engine === id ? "border-foreground/40 bg-accent" : "hover:bg-accent/60",
              )}
            >
              <input
                type="radio"
                name="engine"
                value={id}
                checked={engine === id}
                onChange={() => pick(id)}
                className="sr-only"
              />
              <EngineMark engine={id} className="size-8" />
              <span className="font-medium">{DATABASE_ENGINES[id].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {!projectId ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="db-project" className="text-sm leading-none font-medium">
            Project
          </label>
          <select
            id="db-project"
            value={target}
            onChange={(e) => setProject(e.target.value)}
            className="h-9 rounded-lg border border-input bg-field px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {projects.length === 0 ? <option value="">Create a project first</option> : null}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            Apps in the same project can use it with one click.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          placeholder={info.label}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldError(create.error, "name")}
          autoComplete="off"
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="db-version" className="text-sm leading-none font-medium">
            Version
          </label>
          <select
            id="db-version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="h-9 rounded-lg border border-input bg-field px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {info.versions.map((v, i) => (
              <option key={v} value={v}>
                {versionLabel(v)}
                {i === 0 ? " (recommended)" : ""}
              </option>
            ))}
          </select>
        </div>
        {engine !== "redis" ? (
          <Field
            label="Database name"
            className="sm:col-span-2"
            value={dbName}
            onChange={(e) => setDbName(e.target.value)}
            error={fieldError(create.error, "dbName")}
            hint="Created on first start. A user and a strong password are generated for you."
            spellCheck={false}
            autoComplete="off"
          />
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!target || create.isPending}>
          {create.isPending ? "Creating…" : `Create ${info.label}`}
        </Button>
      </div>
    </form>
  );
}
