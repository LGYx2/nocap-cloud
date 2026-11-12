// Kept apart from ApplicationPage so the router can validate ?tab= without loading the page.
export const APP_TABS = [
  "deployments",
  "logs",
  "metrics",
  "domains",
  "environment",
  "settings",
] as const;
export type AppTab = (typeof APP_TABS)[number];
