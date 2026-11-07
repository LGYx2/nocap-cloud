import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths, so the site works on GitHub Pages under /nocap-cloud/ and on its own domain.
  base: "./",
  plugins: [tailwindcss()],
  server: { port: 5174 },
});
