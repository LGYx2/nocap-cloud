import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Application, ApplicationInput, AppSource } from "@nocap/shared";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { api, ApiRequestError } from "../api";
import { GitBranchIcon, ImageIcon } from "../components/icons";
import { Alert, Button, cn, Field } from "../components/ui";
import { refreshApps } from "../queries";

const SOURCES: Array<{ value: AppSource; label: string; detail: string; icon: typeof ImageIcon }> =
  [
    {
      value: "git",
      label: "Git repository",
      detail: "Build from a Dockerfile",
      icon: GitBranchIcon,
    },
    { value: "image", label: "Docker image", detail: "Run a ready-made image", icon: ImageIcon },
  ];

/** Form to add an application to a project. Opens the new app's page when done. */
export function ApplicationForm({
  projectId,
  onCancel,
}: {
  projectId: string;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const [source, setSource] = useState<AppSource>("git");
  const [form, setForm] = useState({
    name: "",
    repoUrl: "",
    branch: "main",
    dockerfilePath: "Dockerfile",
    image: "",
    port: "3000",
  });

  const create = useMutation({
    mutationFn: () => {
      const body: ApplicationInput =
        source === "git"
          ? {
              source,
              name: form.name,
              repoUrl: form.repoUrl,
              branch: form.branch,
              dockerfilePath: form.dockerfilePath,
              port: Number(form.port),
            }
          : { source, name: form.name, image: form.image, port: Number(form.port) };
      return api<{ application: Application }>(`/api/projects/${projectId}/applications`, {
        method: "POST",
        body,
      });
    },
    onSuccess: async ({ application }) => {
      await refreshApps(application.id);
      await navigate({ to: "/apps/$appId", params: { appId: application.id } });
    },
  });

  const error = (name: string) =>
    create.error instanceof ApiRequestError ? create.error.fields[name] : undefined;
  const set = (name: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [name]: e.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <div role="radiogroup" aria-label="Source" className="grid grid-cols-2 gap-2">
        {SOURCES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={source === option.value}
            onClick={() => {
              setSource(option.value);
              setForm((f) => ({ ...f, port: option.value === "git" ? "3000" : "80" }));
            }}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
              source === option.value
                ? "border-foreground ring-1 ring-foreground"
                : "hover:bg-accent",
            )}
          >
            <option.icon className="size-4" />
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground">{option.detail}</span>
          </button>
        ))}
      </div>

      {create.error &&
      !(create.error instanceof ApiRequestError && Object.keys(create.error.fields).length) ? (
        <Alert>{create.error.message}</Alert>
      ) : null}

      <Field
        label="Name"
        placeholder={source === "git" ? "Storefront" : "Docs site"}
        value={form.name}
        onChange={set("name")}
        error={error("name")}
        autoFocus
      />

      {source === "git" ? (
        <>
          <Field
            label="Repository"
            placeholder="https://github.com/you/app.git"
            hint="Public repositories for now. Private ones arrive with Git providers."
            value={form.repoUrl}
            onChange={set("repoUrl")}
            error={error("repoUrl")}
            spellCheck={false}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Branch"
              value={form.branch}
              onChange={set("branch")}
              error={error("branch")}
            />
            <Field
              label="Dockerfile"
              value={form.dockerfilePath}
              onChange={set("dockerfilePath")}
              error={error("dockerfilePath")}
            />
          </div>
        </>
      ) : (
        <Field
          label="Image"
          placeholder="nginx:alpine"
          hint="Any public image from Docker Hub or another registry."
          value={form.image}
          onChange={set("image")}
          error={error("image")}
          spellCheck={false}
        />
      )}

      <Field
        label="Port"
        hint="The port the app listens on inside the container."
        inputMode="numeric"
        value={form.port}
        onChange={set("port")}
        error={error("port")}
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create app"}
        </Button>
      </div>
    </form>
  );
}
