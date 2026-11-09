// After an update, a tab that was already open still runs the old build. When it opens a page
// it has not loaded yet, it asks for a file that no longer exists. Browsers word that failure
// differently; all of them mean "load the new version".
const STALE = [
  "Importing a module script failed", // Safari
  "Failed to fetch dynamically imported module", // Chrome, Edge
  "error loading dynamically imported module", // Firefox
  "Unable to preload CSS",
  "is not a valid JavaScript MIME type",
];

export const isStaleBuildError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return STALE.some((text) => message.includes(text));
};

const KEY = "nocap-reloaded-at";
let pending = false;

/**
 * Reloads once to pick up the new version. Returns false when it already reloaded in the last
 * ten seconds, so a real network problem cannot cause a reload loop.
 */
export function reloadForNewBuild(): boolean {
  if (pending) return true;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 10_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage blocked: reload anyway; the time check is only a guard.
  }
  pending = true;
  window.location.reload();
  return true;
}
