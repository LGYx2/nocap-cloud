import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import type { PublicUser, SetupInput } from "@nocap/shared";
import { PASSWORD_MIN_LENGTH } from "@nocap/shared/constants";
import { api, ApiRequestError } from "../api";
import { Alert, Button, Field } from "../components/ui";
import { meQuery, queryClient, setupStatusQuery } from "../queries";
import { AuthLayout } from "./AuthLayout";

export function SetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<SetupInput>({ name: "", email: "", password: "" });

  const setup = useMutation({
    mutationFn: (input: SetupInput) =>
      api<{ user: PublicUser }>("/api/setup", { method: "POST", body: input }),
    onSuccess: async ({ user }) => {
      queryClient.setQueryData(setupStatusQuery.queryKey, { needsSetup: false });
      queryClient.setQueryData(meQuery.queryKey, user);
      await navigate({ to: "/" });
    },
  });

  const fields = setup.error instanceof ApiRequestError ? setup.error.fields : {};
  const update = (key: keyof SetupInput) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    setup.mutate(form);
  }

  return (
    <AuthLayout
      title="Set up Nocap Cloud"
      subtitle="Create the admin account. You only do this once."
    >
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        {setup.error && !Object.keys(fields).length ? <Alert>{setup.error.message}</Alert> : null}
        <Field
          label="Your name"
          autoComplete="name"
          value={form.name}
          onChange={update("name")}
          error={fields.name}
          required
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={update("email")}
          error={fields.email}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update("password")}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence works well.`}
          error={fields.password}
          required
        />
        <Button type="submit" disabled={setup.isPending} className="mt-1">
          {setup.isPending ? "Creating account…" : "Create admin account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
