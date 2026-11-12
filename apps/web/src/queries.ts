import { QueryClient, queryOptions } from "@tanstack/react-query";
import type {
  Application,
  ContainerUsage,
  DatabaseConnection,
  Deployment,
  Domain,
  EnvVar,
  LinkedVariable,
  ManagedDatabase,
  AlertSettings,
  MonitoringOverview,
  MonitorRange,
  ServiceSeries,
  GitProvider,
  GitRepo,
  HealthResponse,
  Overview,
  PanelSettings,
  Project,
  PublicUser,
  SetupStatus,
} from "@nocap/shared";
import { api, ApiRequestError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

export const setupStatusQuery = queryOptions({
  queryKey: ["setup-status"],
  queryFn: () => api<SetupStatus>("/api/setup/status"),
});

/** The signed-in user, or null when nobody is signed in. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<PublicUser | null> => {
    try {
      const { user } = await api<{ user: PublicUser }>("/api/auth/me");
      return user;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) return null;
      throw err;
    }
  },
});

export const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: () => api<HealthResponse>("/api/health"),
});

export const projectsQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: async () => (await api<{ projects: Project[] }>("/api/projects")).projects,
});

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: ["projects", id],
    queryFn: async () => (await api<{ project: Project }>(`/api/projects/${id}`)).project,
  });

// ---------------------------------------------------------------- apps and deployments

const busy = (status: string | undefined) => status === "building" || status === "queued";

export const overviewQuery = queryOptions({
  queryKey: ["overview"],
  queryFn: () => api<Overview>("/api/overview"),
  refetchInterval: 15_000,
});

export const allApplicationsQuery = queryOptions({
  queryKey: ["applications"],
  queryFn: async () =>
    (await api<{ applications: Application[] }>("/api/applications")).applications,
});

export const projectApplicationsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "applications"],
    queryFn: async () =>
      (await api<{ applications: Application[] }>(`/api/projects/${projectId}/applications`))
        .applications,
    refetchInterval: (query) => (query.state.data?.some((app) => busy(app.status)) ? 2000 : false),
  });

export const applicationQuery = (id: string) =>
  queryOptions({
    queryKey: ["application", id],
    queryFn: async () =>
      (await api<{ application: Application }>(`/api/applications/${id}`)).application,
    refetchInterval: (query) => (busy(query.state.data?.status) ? 1500 : false),
  });

export const applicationDeploymentsQuery = (id: string, live: boolean) =>
  queryOptions({
    queryKey: ["application", id, "deployments"],
    queryFn: async () =>
      (await api<{ deployments: Deployment[] }>(`/api/applications/${id}/deployments`)).deployments,
    refetchInterval: live ? 1500 : false,
  });

export const deploymentsQuery = queryOptions({
  queryKey: ["deployments"],
  queryFn: async () =>
    (await api<{ deployments: Deployment[] }>("/api/deployments?limit=50")).deployments,
  refetchInterval: (query) => (query.state.data?.some((d) => busy(d.status)) ? 2000 : 30_000),
});

export const domainsQuery = (id: string) =>
  queryOptions({
    queryKey: ["application", id, "domains"],
    queryFn: async () =>
      (await api<{ domains: Domain[] }>(`/api/applications/${id}/domains`)).domains,
  });

export const envQuery = (id: string) =>
  queryOptions({
    queryKey: ["application", id, "env"],
    queryFn: () => api<{ vars: EnvVar[]; linked: LinkedVariable[] }>(`/api/applications/${id}/env`),
  });

export const appLogsQuery = (id: string, follow: boolean) =>
  queryOptions({
    queryKey: ["application", id, "logs"],
    queryFn: () => api<{ logs: string; running: boolean }>(`/api/applications/${id}/logs?tail=300`),
    refetchInterval: follow ? 5000 : false,
  });

/** After anything changes an app, refresh every view that shows it. */
export async function refreshApps(appId?: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["applications"] }),
    queryClient.invalidateQueries({ queryKey: ["projects"] }),
    queryClient.invalidateQueries({ queryKey: ["deployments"] }),
    queryClient.invalidateQueries({ queryKey: ["overview"] }),
    appId ? queryClient.invalidateQueries({ queryKey: ["application", appId] }) : undefined,
  ]);
}

// ---------------------------------------------------------------- databases

const starting = (list: ManagedDatabase[] | undefined) =>
  list?.some((db) => db.status === "starting") ? 2000 : false;

export const databasesQuery = queryOptions({
  queryKey: ["databases"],
  queryFn: async () => (await api<{ databases: ManagedDatabase[] }>("/api/databases")).databases,
  refetchInterval: (query) => starting(query.state.data),
});

export const projectDatabasesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["databases", "project", projectId],
    queryFn: async () =>
      (await api<{ databases: ManagedDatabase[] }>(`/api/projects/${projectId}/databases`))
        .databases,
    refetchInterval: (query) => starting(query.state.data),
  });

export const databaseQuery = (id: string) =>
  queryOptions({
    queryKey: ["databases", "one", id],
    queryFn: async () =>
      (await api<{ database: ManagedDatabase }>(`/api/databases/${id}`)).database,
    refetchInterval: (query) => (query.state.data?.status === "starting" ? 1500 : false),
  });

/** The password and URL. Only fetched when someone asks to see them. */
export const databaseConnectionQuery = (id: string) =>
  queryOptions({
    queryKey: ["databases", "one", id, "connection"],
    queryFn: () => api<DatabaseConnection>(`/api/databases/${id}/connection`),
    staleTime: Infinity,
  });

export const databaseLogsQuery = (id: string, follow: boolean) =>
  queryOptions({
    queryKey: ["databases", "one", id, "logs"],
    queryFn: () => api<{ logs: string; running: boolean }>(`/api/databases/${id}/logs?tail=200`),
    refetchInterval: follow ? 5000 : false,
  });

/** CPU and memory per service. The server reads Docker at most every 10 seconds. */
export const projectUsageQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "usage"],
    queryFn: () =>
      api<{ available: boolean; usage: Record<string, ContainerUsage> }>(
        `/api/projects/${projectId}/usage`,
      ),
    refetchInterval: 15_000,
  });

export async function refreshDatabases(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["databases"] }),
    queryClient.invalidateQueries({ queryKey: ["projects"] }),
    queryClient.invalidateQueries({ queryKey: ["application"] }),
  ]);
}

// ---------------------------------------------------------------- monitoring

/** Readings are taken once a minute on the server, so asking more often shows nothing new. */
export const monitoringQuery = (range: MonitorRange) =>
  queryOptions({
    queryKey: ["monitoring", range],
    queryFn: () => api<MonitoringOverview>(`/api/monitoring?range=${range}`),
    refetchInterval: 60_000,
    placeholderData: (previous: MonitoringOverview | undefined) => previous,
  });

export const serviceSeriesQuery = (id: string, range: MonitorRange) =>
  queryOptions({
    queryKey: ["monitoring", "service", id, range],
    queryFn: () => api<ServiceSeries>(`/api/monitoring/services/${id}?range=${range}`),
    refetchInterval: 60_000,
    placeholderData: (previous: ServiceSeries | undefined) => previous,
  });

export const alertSettingsQuery = queryOptions({
  queryKey: ["monitoring", "alerts"],
  queryFn: async () => (await api<{ alerts: AlertSettings }>("/api/monitoring/alerts")).alerts,
});

// ---------------------------------------------------------------- git and settings

export const gitProvidersQuery = queryOptions({
  queryKey: ["git-providers"],
  queryFn: async () => (await api<{ providers: GitProvider[] }>("/api/git-providers")).providers,
});

export const reposQuery = (providerId: string) =>
  queryOptions({
    queryKey: ["git-providers", providerId, "repos"],
    queryFn: async () =>
      (await api<{ repos: GitRepo[] }>(`/api/git-providers/${providerId}/repos`)).repos,
    staleTime: 60_000,
  });

export const branchesQuery = (providerId: string, repo: string) =>
  queryOptions({
    queryKey: ["git-providers", providerId, "branches", repo],
    queryFn: async () =>
      (
        await api<{ branches: string[] }>(
          `/api/git-providers/${providerId}/branches?repo=${encodeURIComponent(repo)}`,
        )
      ).branches,
    staleTime: 60_000,
  });

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => (await api<{ settings: PanelSettings }>("/api/settings")).settings,
});
