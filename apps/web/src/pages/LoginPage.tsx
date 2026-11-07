import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import type { LoginInput, PublicUser } from "@nocap/shared";
import { api, ApiRequestError } from "../api";
import { Alert, Button, Field } from "../components/ui";
import { meQuery, queryClient } from "../queries";
import { AuthLayout } from "./AuthLayout";

export function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginInput>({ email: "", password: "" });

  const login = useMutation({
    mutationFn: (input: LoginInput) =>
      api<{ user: PublicUser }>("/api/auth/login", { method: "POST", body: input }),
    onSuccess: async ({ user }) => {
      queryClient.setQueryData(meQuery.queryKey, user);
      await navigate({ to: "/" });
    },
  });

  const fields = login.error instanceof ApiRequestError ? login.error.fields : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate(form);
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Your servers missed you.">
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        {login.error && !Object.keys(fields).length ? <Alert>{login.error.message}</Alert> : null}
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={fields.email}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={fields.password}
          required
        />
        <Button type="submit" disabled={login.isPending} className="mt-1">
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
