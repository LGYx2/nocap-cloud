import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "./constants";

export * from "./constants";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address" }))
  .pipe(z.string().max(254));

export const setupSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter your name" }).max(100),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, {
      error: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
    })
    .max(200),
});
export type SetupInput = z.infer<typeof setupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password" }).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export interface SetupStatus {
  needsSetup: boolean;
}

export interface HealthResponse {
  status: "ok";
  version: string;
}

export interface ApiError {
  error: string;
  /** Field-level messages for validation errors, keyed by field name. */
  fields?: Record<string, string>;
}
