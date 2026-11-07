import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { DEMO } from "./api";
import { DemoBanner } from "./components/demo-banner";
import { APP_TABS, ApplicationPage, type AppTab } from "./pages/ApplicationPage";
import { AppShell } from "./pages/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { DeploymentsPage } from "./pages/DeploymentsPage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SetupPage } from "./pages/SetupPage";
import { meQuery, queryClient, setupStatusQuery } from "./queries";

const rootRoute = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      {DEMO ? <DemoBanner /> : null}
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
  component: DashboardPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects",
  component: ProjectsPage,
});

const projectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects/$projectId",
  component: ProjectPage,
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
  component: ApplicationPage,
});

const deploymentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/deployments",
  component: DeploymentsPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: () => guard("setup"),
  component: SetupPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => guard("login"),
  component: LoginPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    appRoute.addChildren([
      dashboardRoute,
      projectsRoute,
      projectRoute,
      applicationRoute,
      deploymentsRoute,
    ]),
    setupRoute,
    loginRoute,
  ]),
  defaultPreload: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
