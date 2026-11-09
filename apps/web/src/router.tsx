import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { isStaleBuildError, reloadForNewBuild } from "./lib/stale-build";
import { APP_TABS, type AppTab } from "./pages/app-tabs";
import { AppShell } from "./pages/AppShell";
import { meQuery, queryClient, setupStatusQuery } from "./queries";

// Each page is its own file, downloaded the first time it is opened. The first load only
// fetches the shell and the page you land on.
const page = {
  dashboard: lazyRouteComponent(() => import("./pages/DashboardPage"), "DashboardPage"),
  projects: lazyRouteComponent(() => import("./pages/ProjectsPage"), "ProjectsPage"),
  project: lazyRouteComponent(() => import("./pages/ProjectPage"), "ProjectPage"),
  application: lazyRouteComponent(() => import("./pages/ApplicationPage"), "ApplicationPage"),
  deployments: lazyRouteComponent(() => import("./pages/DeploymentsPage"), "DeploymentsPage"),
  databases: lazyRouteComponent(() => import("./pages/DatabasesPage"), "DatabasesPage"),
  database: lazyRouteComponent(() => import("./pages/DatabasePage"), "DatabasePage"),
  git: lazyRouteComponent(() => import("./pages/GitPage"), "GitPage"),
  settings: lazyRouteComponent(() => import("./pages/SettingsPage"), "SettingsPage"),
  setup: lazyRouteComponent(() => import("./pages/SetupPage"), "SetupPage"),
  login: lazyRouteComponent(() => import("./pages/LoginPage"), "LoginPage"),
};

// Only the demo build includes the banner; the normal build drops it with the demo code.
const DemoBanner =
  import.meta.env.VITE_DEMO === "true"
    ? lazy(() => import("./components/demo-banner").then((m) => ({ default: m.DemoBanner })))
    : null;

const rootRoute = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      {DemoBanner ? (
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  ),
});

/**
 * Shown when a page fails to load. A tab left open across an update reloads into the new
 * version on its own; anything else gets a plain message and a way to try again.
 */
function RouteError({ error }: { error: unknown }) {
  const stale = isStaleBuildError(error);
  const [reloading, setReloading] = useState(stale);
  useEffect(() => {
    if (stale) setReloading(reloadForNewBuild());
  }, [stale]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-semibold">
        {reloading
          ? "Loading the new version…"
          : stale
            ? "Nocap Cloud was updated"
            : "This page could not load"}
      </h1>
      {reloading ? null : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {stale
              ? "Reload to get the new version."
              : error instanceof Error
                ? error.message
                : "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Reload
          </button>
        </>
      )}
    </main>
  );
}

/** Sends people to setup on a fresh install, and to login when they are signed out. */
async function guard(target: "setup" | "login" | "app") {
  const { needsSetup } = await queryClient.ensureQueryData(setupStatusQuery);
  if (needsSetup) {
    if (target !== "setup") throw redirect({ to: "/setup" });
    return;
  }
  if (target === "setup") throw redirect({ to: "/" });

  const user = await queryClient.ensureQueryData(meQuery);
  if (!user && target === "app") throw redirect({ to: "/login" });
  if (user && target === "login") throw redirect({ to: "/" });
}

/** Every signed-in page shares the sidebar and the auth guard. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () => guard("app"),
  component: AppShell,
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: page.dashboard,
});

const projectsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects",
  component: page.projects,
});

const projectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects/$projectId",
  component: page.project,
});

interface AppSearch {
  tab?: AppTab;
  deployment?: string;
}

const applicationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/apps/$appId",
  validateSearch: (search: Record<string, unknown>): AppSearch => ({
    tab: APP_TABS.includes(search.tab as AppTab) ? (search.tab as AppTab) : undefined,
    deployment: typeof search.deployment === "string" ? search.deployment : undefined,
  }),
  component: page.application,
});

const deploymentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/deployments",
  validateSearch: (search: Record<string, unknown>): { project?: string } => ({
    project: typeof search.project === "string" ? search.project : undefined,
  }),
  component: page.deployments,
});

const databasesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/databases",
  component: page.databases,
});

const databaseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/databases/$databaseId",
  component: page.database,
});

const gitRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/git",
  validateSearch: (search: Record<string, unknown>): { installed?: string; error?: string } => ({
    installed: search.installed ? String(search.installed) : undefined,
    error: typeof search.error === "string" ? search.error.slice(0, 200) : undefined,
  }),
  component: page.git,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: page.settings,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: () => guard("setup"),
  component: page.setup,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => guard("login"),
  component: page.login,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    appRoute.addChildren([
      dashboardRoute,
      projectsRoute,
      projectRoute,
      applicationRoute,
      deploymentsRoute,
      databasesRoute,
      databaseRoute,
      gitRoute,
      settingsRoute,
    ]),
    setupRoute,
    loginRoute,
  ]),
  defaultErrorComponent: RouteError,
  // Fetch a page's code when the pointer rests on its link, so opening it feels instant.
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
