import { z } from "zod";

export type GitProviderType = "github" | "gitlab";

export interface GitProvider {
  id: string;
  type: GitProviderType;
  name: string;
  /** GitHub: the app's page; GitLab: the instance URL. */
  url: string;
  /** GitHub only: whether the app is installed on at least one account. */
  installed: boolean;
  /** GitHub only: where to add or remove repositories the app can see. */
  installUrl: string | null;
  createdAt: string;
}

export interface GitRepo {
  fullName: string;
  /** https:// clone address without credentials. */
  url: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string | null;
}

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .regex(/^https?:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/i, {
    error: "Use a full address, like https://panel.example.com",
  })
  .transform((value) => value.replace(/\/+$/, ""));

export const githubManifestSchema = z.object({
  /** Where the panel is reachable, as GitHub must call it back and send webhooks there. */
  panelUrl: httpsUrl,
  /** Create the app under an organization instead of the signed-in user. */
  organization: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9-]*$/i, { error: "Organization name, letters, numbers and - only" })
    .optional(),
});
export type GithubManifestInput = z.input<typeof githubManifestSchema>;

export const gitlabInputSchema = z.object({
  name: z.string().trim().max(60).optional(),
  baseUrl: httpsUrl.default("https://gitlab.com"),
  token: z.string().trim().min(10, { error: "Paste a personal access token" }).max(200),
});
export type GitlabInput = z.input<typeof gitlabInputSchema>;

// ---------------------------------------------------------------- settings

export interface PanelSettings {
  /** Public address of the panel, used in webhooks and GitHub callbacks. */
  panelUrl: string | null;
  version: string;
  /** NOCAP_SECRET is set, so secrets can be stored. */
  secretConfigured: boolean;
  dockerNetwork: string;
}

export const settingsUpdateSchema = z.object({
  panelUrl: z.union([httpsUrl, z.literal("").transform(() => null)]),
});
export type SettingsUpdate = z.input<typeof settingsUpdateSchema>;
