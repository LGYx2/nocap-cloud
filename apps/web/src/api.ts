import type { ApiError } from "@nocap/shared";

/** An API call that answered with an error status. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** True in the demo build, where a fake API in the browser replaces the server. */
export const DEMO = import.meta.env.VITE_DEMO === "true";

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (DEMO) {
    const { demoRequest } = await import("./demo");
    const { status, data } = await demoRequest(options.method ?? "GET", path, options.body);
    if (status >= 400) {
      const error = data as ApiError;
      throw new ApiRequestError(status, error.error, error.fields);
    }
    return data as T;
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(
      response.status,
      error.error ?? `Request failed with status ${response.status}`,
      error.fields,
    );
  }
  return data as T;
}
