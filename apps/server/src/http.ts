import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import type { ApiError } from "@nocap/shared";

/** An error with an HTTP status that is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Validates a request body. On failure it sends a 400 with one message per field
 * and returns undefined, so the handler can simply return.
 */
export function parseBody<T extends z.ZodType>(
  schema: T,
  request: FastifyRequest,
  reply: FastifyReply,
): z.infer<T> | undefined {
  const result = schema.safeParse(request.body ?? {});
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  const body: ApiError = { error: "Check the highlighted fields", fields };
  void reply.code(400).send(body);
  return undefined;
}

/** preHandler for routes that need a signed-in user. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    const body: ApiError = { error: "Sign in to continue" };
    await reply.code(401).send(body);
  }
}
