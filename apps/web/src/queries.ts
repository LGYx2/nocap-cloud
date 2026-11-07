import { QueryClient, queryOptions } from "@tanstack/react-query";
import type {
  Application,
  Deployment,
  Domain,
  EnvVar,
  HealthResponse,
  Overview,
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
  refetchInterval: 5000,
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
  refetchInterval: (query) => (query.state.data?.some((d) => busy(d.status)) ? 2000 : 15000),
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
    queryFn: async () => (await api<{ vars: EnvVar[] }>(`/api/applications/${id}/env`)).vars,
  });

export const appLogsQuery = (id: string, follow: boolean) =>
  queryOptions({
    queryKey: ["application", id, "logs"],
    queryFn: () => api<{ logs: string; running: boolean }>(`/api/applications/${id}/logs?tail=300`),
    refetchInterval: follow ? 3000 : false,
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
