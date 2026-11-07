import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { api } from "../api";
import {
  ChevronRightIcon,
  FolderIcon,
  GitBranchIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  ServerIcon,
  SettingsIcon,
  SunIcon,
} from "../components/icons";
import { cn, Logo } from "../components/ui";
import { initials } from "../lib/format";
import { healthQuery, meQuery, queryClient } from "../queries";
import { type Theme, useTheme } from "../theme";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const soon: Array<{ label: string; icon: IconType }> = [
  { label: "Servers", icon: ServerIcon },
  { label: "Git providers", icon: GitBranchIcon },
  { label: "Settings", icon: SettingsIcon },
];

const themes: Array<{ value: Theme; label: string; icon: IconType }> = [
  { value: "system", label: "System theme", icon: MonitorIcon },
  { value: "light", label: "Light theme", icon: SunIcon },
  { value: "dark", label: "Dark theme", icon: MoonIcon },
];

function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-md border p-0.5">
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "rounded-sm p-1.5 transition-colors",
            theme === value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

/** Sidebar and frame for every signed-in page. */
export function AppShell() {
  const navigate = useNavigate();
  const { data: user } = useQuery(meQuery);
  const { data: health } = useQuery(healthQuery);

  const logout = useMutation({
    mutationFn: () => api<void>("/api/auth/logout", { method: "POST" }),
    onSettled: async () => {
      queryClient.clear();
      queryClient.setQueryData(meQuery.queryKey, null);
      await navigate({ to: "/login" });
    },
  });

  const signOut = (
    <button
      type="button"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      aria-label="Sign out"
      title="Sign out"
      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      <LogOutIcon />
    </button>
  );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b bg-muted/40 md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 md:py-4">
          <Logo />
          <div className="md:hidden">{signOut}</div>
        </div>

        <nav
          aria-label="Main"
          className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0"
        >
          <Link
            to="/"
            activeOptions={{ exact: false }}
            className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "bg-accent font-medium !text-foreground" }}
          >
            <FolderIcon />
            Projects
          </Link>
          {soon.map(({ label, icon: Icon }) => (
            <span
              key={label}
              aria-disabled="true"
              className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground/70"
            >
              <Icon />
              {label}
              <span className="ml-auto rounded border px-1.5 py-0.5 text-[10px] leading-none font-medium tracking-wide uppercase">
                soon
              </span>
            </span>
          ))}
        </nav>

        <div className="mt-auto hidden flex-col gap-3 border-t p-3 md:flex">
          <div className="flex items-center justify-between px-1">
            <ThemeSwitch />
            <span className="font-mono text-[11px] text-muted-foreground">
              {health?.version ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-2.5 rounded-md p-1">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {user ? initials(user.name) : ""}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{user?.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
            </span>
            {signOut}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

/** Top bar of a page: breadcrumb trail on the left, actions on the right. */
export function PageHeader({
  crumbs,
  actions,
}: {
  crumbs: Array<{ label: string; to?: string }>;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 md:px-8">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={crumb.label} className="flex min-w-0 items-center gap-1.5">
                {crumb.to && !last ? (
                  <Link
                    to={crumb.to}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className="truncate font-medium">
                    {crumb.label}
                  </span>
                )}
                {last ? null : <ChevronRightIcon className="size-3.5 text-muted-foreground" />}
              </li>
            );
          })}
        </ol>
      </nav>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
