import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
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
  // Fetch a page's code when the pointer rests on its link, so opening it feels instant.
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
