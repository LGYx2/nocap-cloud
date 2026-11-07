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

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
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
