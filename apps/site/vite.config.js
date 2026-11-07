import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { Marked } from "marked";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, "../..");
const GITHUB = "https://github.com/LGYx2/nocap-cloud";

/** Repository files that have their own page on the site; links between them stay on the site. */
const docPages = {
  "README.md": "./docs.html",
  "CHANGELOG.md": "./changelog.html",
  "CONTRIBUTING.md": "./contributing.html",
  "SECURITY.md": "./security.html",
  "CODE_OF_CONDUCT.md": "./conduct.html",
};

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

function rewriteLink(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [path, hash] = href.split("#");
  const page = docPages[path];
  if (page) return hash ? `${page}#${hash}` : page;
  return `${GITHUB}/blob/main/${path}${hash ? `#${hash}` : ""}`;
}

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const id = slug(text);
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const target = rewriteLink(href);
      const external = target.startsWith("http") && !target.startsWith("https://nocapcloud.click");
      return `<a href="${target}"${title ? ` title="${title}"` : ""}${external ? ' rel="noopener"' : ""}>${text}</a>`;
    },
  },
});

/** Renders a Markdown file from the repository root. The README's logo block is left out. */
function renderDoc(file) {
  let markdown = readFileSync(resolve(repo, file), "utf8");
  if (file === "README.md") markdown = markdown.slice(markdown.indexOf("\n> "));
  return `<div class="prose">${marked.parse(markdown)}</div>`;
}

/**
 * Build-time includes: `<!-- partial:name -->` inserts partials/name.html, so every page shares
 * one header and footer; `<!-- doc:FILE.md -->` inserts a rendered Markdown file from the repo.
 */
function includes() {
  return {
    name: "nocap-includes",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html
          .replace(/<!--\s*partial:([a-z-]+)\s*-->/g, (_, name) =>
            readFileSync(resolve(root, "partials", `${name}.html`), "utf8"),
          )
          .replace(/<!--\s*doc:([A-Z_]+\.md)\s*-->/g, (_, file) => renderDoc(file)),
    },
  };
}

const pages = [
  "index",
  "features",
  "roadmap",
  "community",
  "docs",
  "changelog",
  "contributing",
  "security",
  "conduct",
];

export default defineConfig({
  // Relative paths, so the site works on its own domain and on GitHub Pages under /nocap-cloud/.
  base: "./",
  plugins: [includes(), tailwindcss()],
  server: { port: 5174 },
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page, resolve(root, `${page}.html`)])),
    },
  },
});
