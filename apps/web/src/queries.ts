import { QueryClient, queryOptions } from "@tanstack/react-query";
import type { HealthResponse, PublicUser, SetupStatus } from "@nocap/shared";
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
