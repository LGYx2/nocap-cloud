// Bundles the server, the workspace packages and all pure-JS dependencies into dist/index.js.
// Only native modules stay external; the Docker image installs just those, which keeps it small.
import { build } from "esbuild";

/** Packages that cannot be bundled: native binaries, or dev-only log formatting. */
export const external = ["@node-rs/argon2", "pino-pretty"];

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  minifySyntax: true,
  legalComments: "linked",
  external,
  banner: {
    js: "import { createRequire as __nocapCreateRequire } from 'node:module'; const require = __nocapCreateRequire(import.meta.url);",
  },
  logLevel: "warning",
});

console.log("Built dist/index.js");
