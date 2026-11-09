// Latin-only font files keep the panel small. Fonts are bundled, so the panel
// never calls a third-party font server.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/fredoka/latin-700.css";
import "./styles.css";

import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { reloadForNewBuild } from "./lib/stale-build";
import { router } from "./router";

// A page file of an older version could not be loaded: load the new version instead of failing.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewBuild()) event.preventDefault();
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Installable app: register the small service worker in production builds only, so the dev server
// never serves cached files. It checks for a new version on every load.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      // Not fatal: the panel works the same without it, just not offline.
    });
  });
}
