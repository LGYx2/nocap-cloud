import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import type { Project, ProjectInput } from "@nocap/shared";
import { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX } from "@nocap/shared/constants";
import { api, ApiRequestError } from "../api";
import { Alert, Button, Field } from "../components/ui";
import { queryClient } from "../queries";

/** Create a project, or edit one when `project` is given. */
export function ProjectForm({
  project,
  onDone,
  onCancel,
}: {
  project?: Project;
  onDone: (project: Project) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: project?.name ?? "",
    description: project?.description ?? "",
  });

  const save = useMutation({
    mutationFn: (input: ProjectInput) =>
      project
        ? api<{ project: Project }>(`/api/projects/${project.id}`, { method: "PATCH", body: input })
        : api<{ project: Project }>("/api/projects", { method: "POST", body: input }),
    onSuccess: async ({ project: saved }) => {
      queryClient.setQueryData(["projects", saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ["projects"], exact: true });
      onDone(saved);
    },
  });

  const fields = save.error instanceof ApiRequestError ? save.error.fields : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(form);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      {save.error && !Object.keys(fields).length ? <Alert>{save.error.message}</Alert> : null}
      <Field
        label="Name"
        value={form.name}
        maxLength={PROJECT_NAME_MAX}
        placeholder="My project"
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        error={fields.name}
        autoFocus
        required
      />
      <Field
        label="Description"
        value={form.description}
        maxLength={PROJECT_DESCRIPTION_MAX}
        placeholder="Optional"
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        error={fields.description}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : project ? "Save changes" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
