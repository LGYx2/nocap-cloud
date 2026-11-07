import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

/** Replaces `<!-- partial:name -->` with partials/name.html, so every page shares one header and footer. */
function partials() {
  return {
    name: "nocap-partials",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html.replace(/<!--\s*partial:([a-z-]+)\s*-->/g, (_, name) =>
          readFileSync(resolve(root, "partials", `${name}.html`), "utf8"),
        ),
    },
  };
}

export default defineConfig({
  // Relative paths, so the site works on its own domain and on GitHub Pages under /nocap-cloud/.
  base: "./",
  plugins: [partials(), tailwindcss()],
  server: { port: 5174 },
  build: {
    rollupOptions: {
      input: {
        home: resolve(root, "index.html"),
        features: resolve(root, "features.html"),
        roadmap: resolve(root, "roadmap.html"),
        community: resolve(root, "community.html"),
      },
    },
  },
});
