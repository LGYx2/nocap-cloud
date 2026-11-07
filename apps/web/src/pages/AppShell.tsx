import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { api } from "../api";
import {
  ActivityIcon,
  ArrowLeftIcon,
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

/**
 * Main pages. `short` is the label in the phone's bottom tab bar, which has room for five;
 * on phones, databases are reached from their project.
 */
const main = [
  { to: "/", label: "Dashboard", short: "Home", icon: DashboardIcon, exact: true, tab: true },
  {
    to: "/projects",
    label: "Projects",
    short: "Projects",
    icon: FolderIcon,
    exact: false,
    tab: true,
  },
  {
    to: "/deployments",
    label: "Deployments",
    short: "Deploys",
    icon: RocketIcon,
    exact: false,
    tab: true,
  },
  {
    to: "/databases",
    label: "Databases",
    short: "Databases",
    icon: DatabaseIcon,
    exact: false,
    tab: false,
  },
  {
    to: "/git",
    label: "Git providers",
    short: "Git",
    icon: GitBranchIcon,
    exact: false,
    tab: true,
  },
  {
    to: "/settings",
    label: "Settings",
    short: "Settings",
    icon: SettingsIcon,
    exact: false,
    tab: true,
  },
] as const;

const soon: Array<{ label: string; icon: IconType }> = [
  { label: "Monitoring", icon: ActivityIcon },
  { label: "Servers", icon: ServerIcon },
  { label: "Remote access", icon: LockIcon },
];

const themes: Array<{ value: Theme; label: string; icon: IconType }> = [
  { value: "system", label: "System theme", icon: MonitorIcon },
  { value: "light", label: "Light theme", icon: SunIcon },
  { value: "dark", label: "Dark theme", icon: MoonIcon },
];

export function ThemeSwitch() {
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

/**
 * Frame for every signed-in page.
 * Desktop: sidebar and page on two rounded panels. Phone: a top bar with the logo and sign-out,
 * the page in between, and a bottom tab bar, laid out around the notch and home indicator so it
 * also works as an installed app.
 */
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
      className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 md:size-auto md:p-2"
    >
      <LogOutIcon />
    </button>
  );

  return (
    <div className="flex min-h-full flex-col bg-background md:h-dvh md:flex-row md:gap-2 md:overflow-hidden md:bg-shell md:p-2">
      {/* Phone: top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background pt-[env(safe-area-inset-top)] pr-2 pl-4 md:hidden">
        <Link to="/" className="flex h-14 items-center" aria-label="Nocap Cloud home">
          <Logo />
        </Link>
        {signOut}
      </header>

      {/* Desktop: sidebar */}
      <aside className="hidden shrink-0 flex-col bg-sidebar md:flex md:h-full md:w-64 md:overflow-y-auto md:rounded-2xl md:border md:shadow-sm">
        <div className="px-5 py-5">
          <Logo />
        </div>

        <nav aria-label="Main" className="flex flex-col gap-1 px-3">
          {main.map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              className="flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              activeProps={{ className: "bg-accent font-medium !text-foreground" }}
            >
              <Icon />
              {label}
            </Link>
          ))}
          <span className="mt-5 mb-1 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
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

        <div className="mt-auto flex flex-col gap-3 p-3">
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

      {/* The page. On phones it leaves room for the tab bar and the home indicator. */}
      <div className="min-w-0 flex-1 bg-background pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:h-full md:overflow-y-auto md:rounded-2xl md:border md:pb-0 md:shadow-sm">
        <Outlet />
      </div>

      {/* Phone: bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[calc(8px+env(safe-area-inset-bottom))] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {main
            .filter((item) => item.tab)
            .map(({ to, short, icon: Icon, exact }) => (
              <li key={to}>
                <Link
                  to={to}
                  activeOptions={{ exact }}
                  className="flex min-h-[52px] flex-col items-center justify-center gap-1 pt-2 text-[10.5px] font-medium text-muted-foreground transition-colors"
                  activeProps={{ className: "!text-foreground", "aria-current": "page" }}
                >
                  <Icon className="size-[22px]" />
                  {short}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Top bar of a page. Desktop: breadcrumb trail and actions. Phone: no breadcrumbs; pages inside
 * another page get a back arrow and their title, and actions stay on the right.
 */
export function PageHeader({
  crumbs,
  actions,
}: {
  crumbs: Array<{ label: string; to?: string }>;
  actions?: ReactNode;
}) {
  const current = crumbs.at(-1);
  const parent = crumbs.slice(0, -1).findLast((crumb) => crumb.to);

  return (
    <>
      <header className="sticky top-0 z-20 hidden min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-background px-8 py-2.5 md:flex">
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

      {parent?.to || actions ? (
        <div className="flex min-h-14 items-center gap-2 border-b px-2 md:hidden">
          {parent?.to ? (
            <>
              <Link
                to={parent.to}
                aria-label={`Back to ${parent.label}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowLeftIcon className="size-5" />
              </Link>
              <span className="min-w-0 flex-1 truncate font-semibold">{current?.label}</span>
            </>
          ) : (
            <span className="flex-1" />
          )}
          {actions ? <div className="flex shrink-0 items-center gap-2 pr-2">{actions}</div> : null}
        </div>
      ) : null}
    </>
  );
}
