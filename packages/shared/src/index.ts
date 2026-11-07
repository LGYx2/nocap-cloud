import { z } from "zod";
import { PASSWORD_MIN_LENGTH, PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX } from "./constants";

export * from "./constants";
export * from "./apps";
export * from "./git";
export * from "./catalog";
export * from "./databases";

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

const description = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX, {
    error: `Keep it under ${PROJECT_DESCRIPTION_MAX} characters`,
  })
  .transform((value) => (value === "" ? null : value));

export const projectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Give the project a name" })
    .max(PROJECT_NAME_MAX, { error: `Keep it under ${PROJECT_NAME_MAX} characters` }),
  description: description.nullish().transform((value) => value ?? null),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

export const projectUpdateSchema = projectInputSchema.partial();
export type ProjectUpdate = z.input<typeof projectUpdateSchema>;

export interface Project {
  id: string;
  name: string;
  description: string | null;
  applicationCount: number;
  databaseCount: number;
  createdAt: string;
  updatedAt: string;
}

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
