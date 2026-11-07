import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "../api";
import { Button, cn, Logo } from "../components/ui";
import { healthQuery, meQuery, queryClient } from "../queries";

const nav = [
  { label: "Projects", active: true },
  { label: "Servers", soon: true },
  { label: "Git providers", soon: true },
  { label: "Settings", soon: true },
];

function FolderIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: user } = useQuery(meQuery);
  const { data: health } = useQuery(healthQuery);

  const logout = useMutation({
    mutationFn: () => api<void>("/api/auth/logout", { method: "POST" }),
    onSettled: async () => {
      queryClient.setQueryData(meQuery.queryKey, null);
      await navigate({ to: "/login" });
    },
  });

  return (
    <div className="flex min-h-full flex-wrap">
      <aside className="flex w-full flex-col border-b border-line bg-surface px-4 py-4 md:min-h-full md:w-64 md:border-r md:border-b-0 md:py-6">
        <Logo className="px-2" />
        <nav aria-label="Main" className="mt-4 flex gap-1 overflow-x-auto md:mt-8 md:flex-col">
          {nav.map((item) => (
            <span
              key={item.label}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm",
                item.active ? "bg-indigo-soft font-semibold text-indigo-text" : "text-ink-soft",
              )}
            >
              {item.label}
              {item.soon ? (
                <span className="rounded-full bg-mist px-2 py-0.5 text-xs text-ink-soft">soon</span>
              ) : null}
            </span>
          ))}
        </nav>
        <p className="mt-auto hidden px-3 pt-8 font-mono text-xs text-ink-soft md:block">
          {health ? `Nocap Cloud ${health.version}` : null}
        </p>
      </aside>

      <div className="min-w-0 flex-[999_1_560px]">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-surface/60 px-6 py-4 md:px-10">
          <h1 className="font-display text-xl font-bold tracking-tight">Projects</h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-soft sm:inline">{user?.name}</span>
            <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="px-6 py-10 md:px-10">
          <section className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-8 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-soft text-indigo-text">
              <FolderIcon />
            </div>
            <h2 className="mt-5 font-display text-lg font-semibold">No projects yet</h2>
            <p className="mt-2 max-w-sm text-sm text-ink-soft">
              You are signed in and the panel is running. Deploying apps from Git arrives in the
              next release.
            </p>
            <Button className="mt-6" disabled>
              New project
            </Button>
          </section>
        </main>
      </div>
    </div>
  );
}
