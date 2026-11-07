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
            rewrites: [{ source: "/(.*)", destination: "/index.html" }],
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

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "demo" ? [vercelConfig()] : [])],
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
