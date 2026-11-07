import { useMutation, useQuery } from "@tanstack/react-query";
import type { PanelSettings } from "@nocap/shared";
import { type FormEvent, useEffect, useState } from "react";
import { api, ApiRequestError } from "../api";
import { AlertIcon, CheckIcon } from "../components/icons";
import { Alert, Button, cn, Field } from "../components/ui";
import { meQuery, queryClient, settingsQuery } from "../queries";
import { PageHeader } from "./AppShell";

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "flex items-center gap-1.5 font-medium",
          good === false && "text-destructive",
        )}
      >
        {good === true ? <CheckIcon className="size-3.5" /> : null}
        {good === false ? <AlertIcon className="size-3.5" /> : null}
        {value}
      </dd>
    </div>
  );
}

export function SettingsPage() {
  const { data: settings, error } = useQuery(settingsQuery);
  const { data: user } = useQuery(meQuery);
  const [panelUrl, setPanelUrl] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setPanelUrl(settings.panelUrl ?? "");
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      api<{ settings: PanelSettings }>("/api/settings", { method: "PATCH", body: { panelUrl } }),
    onSuccess: ({ settings: next }) => {
      queryClient.setQueryData(settingsQuery.queryKey, next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  const fieldError = save.error instanceof ApiRequestError ? save.error.fields.panelUrl : undefined;

  return (
    <>
      <PageHeader crumbs={[{ label: "Settings" }]} />
      <main className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How this Nocap Cloud install is set up.
        </p>
        {error ? (
          <div className="mt-6">
            <Alert>{error.message}</Alert>
          </div>
        ) : null}

        <form
          onSubmit={submit}
          className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-xs"
        >
          <div className="p-5">
            <h2 className="text-sm font-semibold">Panel address</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The public address of this panel. GitHub and GitLab send push webhooks here, and
              deploy hook URLs start with it.
            </p>
            <div className="mt-4">
              <Field
                label="Address"
                placeholder={window.location.origin}
                value={panelUrl}
                onChange={(e) => setPanelUrl(e.target.value)}
                error={fieldError}
                spellCheck={false}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 border-t bg-muted/40 px-5 py-3">
            {saved ? (
              <span className="mr-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckIcon className="size-3.5" />
                Saved
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setPanelUrl(window.location.origin)}
            >
              Use this address
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </div>
        </form>

        <section className="mt-6 rounded-2xl border bg-card p-5 shadow-xs">
          <h2 className="text-sm font-semibold">This install</h2>
          <dl className="mt-2 divide-y">
            <Row label="Version" value={settings?.version ?? "…"} />
            <Row
              label="Master key (NOCAP_SECRET)"
              value={settings?.secretConfigured ? "Set" : "Missing: secrets cannot be stored"}
              good={settings ? settings.secretConfigured : undefined}
            />
            <Row label="Docker network" value={settings?.dockerNetwork ?? "…"} />
            <Row label="Signed in as" value={user ? `${user.name} (${user.email})` : "…"} />
          </dl>
        </section>
      </main>
    </>
  );
}
