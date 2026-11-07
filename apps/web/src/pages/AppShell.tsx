import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { api } from "../api";
import {
  ActivityIcon,
  ChevronRightIcon,
  DashboardIcon,
  DatabaseIcon,
  FolderIcon,
  GitBranchIcon,
  LockIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  RocketIcon,
  ServerIcon,
  SettingsIcon,
  SunIcon,
} from "../components/icons";
import { cn, Logo } from "../components/ui";
import { initials } from "../lib/format";
import { healthQuery, meQuery, queryClient } from "../queries";
import { type Theme, useTheme } from "../theme";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const main = [
  { to: "/", label: "Dashboard", icon: DashboardIcon, exact: true },
  { to: "/projects", label: "Projects", icon: FolderIcon, exact: false },
  { to: "/deployments", label: "Deployments", icon: RocketIcon, exact: false },
  { to: "/git", label: "Git providers", icon: GitBranchIcon, exact: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, exact: false },
] as const;

const soon: Array<{ label: string; icon: IconType }> = [
  { label: "Databases", icon: DatabaseIcon },
  { label: "Monitoring", icon: ActivityIcon },
  { label: "Servers", icon: ServerIcon },
  { label: "Remote access", icon: LockIcon },
];

const themes: Array<{ value: Theme; label: string; icon: IconType }> = [
  { value: "system", label: "System theme", icon: MonitorIcon },
  { value: "light", label: "Light theme", icon: SunIcon },
  { value: "dark", label: "Dark theme", icon: MoonIcon },
];

function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border p-0.5">
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
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      <LogOutIcon />
    </button>
  );

  return (
    // The sidebar sits on the shell color; each page floats on a rounded panel next to it.
    <div className="flex min-h-full flex-col bg-shell md:h-dvh md:flex-row md:gap-2 md:overflow-hidden md:p-2">
      <aside className="flex shrink-0 flex-col border-b bg-sidebar md:h-full md:w-64 md:overflow-y-auto md:rounded-2xl md:border md:shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 md:py-5">
          <Logo />
          <div className="md:hidden">{signOut}</div>
        </div>

        <nav
          aria-label="Main"
          className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0"
        >
          {main.map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              className="flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              activeProps={{
                className: "bg-accent font-medium !text-foreground",
              }}
            >
              <Icon />
              {label}
            </Link>
          ))}
          <span className="mt-5 mb-1 hidden px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase md:block">
            Coming next
          </span>
          {soon.map(({ label, icon: Icon }) => (
            <span
              key={label}
              aria-disabled="true"
              className="flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground/60"
            >
              <Icon />
              {label}
              <span className="ml-auto rounded-full border px-2 py-0.5 text-[10px] leading-none font-medium tracking-wide uppercase">
                soon
              </span>
            </span>
          ))}
        </nav>

        <div className="mt-auto hidden flex-col gap-3 p-3 md:flex">
          <div className="flex items-center justify-between px-1">
            <ThemeSwitch />
            <span className="font-mono text-[11px] text-muted-foreground">
              {health?.version ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl border bg-background p-2 shadow-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground">
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

      <div className="min-w-0 flex-1 bg-background md:h-full md:overflow-y-auto md:rounded-2xl md:border md:shadow-sm">
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
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-background/80 px-4 py-2.5 backdrop-blur md:px-8">
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
