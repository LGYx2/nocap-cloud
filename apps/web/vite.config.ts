import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** In the demo build, adds the Vercel settings: every path serves the panel, assets cache forever. */
function vercelConfig(): Plugin {
  return {
    name: "nocap-vercel-config",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "vercel.json",
        source: JSON.stringify(
          {
            // Every page path serves the panel, but a missing file under /assets is a 404:
            // answering it with the page would make browsers run HTML as a script.
            rewrites: [{ source: "/((?!assets/).*)", destination: "/index.html" }],
            headers: [
              {
                source: "/assets/(.*)",
                headers: [{ key: "cache-control", value: "public, max-age=31536000, immutable" }],
              },
            ],
          },
          null,
          2,
        ),
      });
    },
  };
}

/**
 * Stamps the service worker with a build id made from the output file names. A new panel version
 * changes the id, so the browser installs the new worker and drops the old cache.
 */
function stampServiceWorker(): Plugin {
  let names: string[] = [];
  let outDir = "dist";
  return {
    name: "nocap-sw-stamp",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle(_options, bundle) {
      names = Object.keys(bundle).sort();
    },
    writeBundle() {
      const file = resolve(outDir, "sw.js");
      const id = createHash("sha256").update(names.join("\n")).digest("hex").slice(0, 12);
      writeFileSync(file, readFileSync(file, "utf8").replace("__NOCAP_BUILD__", id));
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    stampServiceWorker(),
    ...(mode === "demo" ? [vercelConfig()] : []),
  ],
  // `--mode demo` builds the panel with a fake API in the browser (see src/demo.ts).
  define: mode === "demo" ? { "import.meta.env.VITE_DEMO": JSON.stringify("true") } : {},
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
}));
