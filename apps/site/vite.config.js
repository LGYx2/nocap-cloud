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

const SITE = "https://nocapcloud.click";
const escapeAttr = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Facts for search engines about the project, added to the home page. */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Nocap Cloud",
      url: `${SITE}/`,
      description:
        "Free, open-source and lightweight deployment panel for your own server. Push to GitHub or GitLab and your app goes live with HTTPS.",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Linux",
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      image: `${SITE}/og.png`,
      sameAs: [GITHUB],
      author: { "@type": "Person", name: "Ismael Valgy", url: "https://github.com/LGYx2" },
    },
    { "@type": "WebSite", name: "Nocap Cloud", url: `${SITE}/` },
  ],
};

/**
 * Search and link-preview tags for every page, built from the page's own <title> and description:
 * canonical address, Open Graph and Twitter cards with the preview image. Also writes
 * sitemap.xml and robots.txt.
 */
function seo(pageNames) {
  const url = (name) => (name === "index" ? `${SITE}/` : `${SITE}/${name}`);
  return {
    name: "nocap-seo",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const name = ctx.filename.replace(/\\/g, "/").split("/").pop().replace(".html", "");
        const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "Nocap Cloud";
        const description = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html)?.[1] ?? "";
        const tags = [
          `<link rel="canonical" href="${url(name)}" />`,
          `<meta name="robots" content="index, follow, max-image-preview:large" />`,
          `<meta property="og:site_name" content="Nocap Cloud" />`,
          `<meta property="og:type" content="website" />`,
          `<meta property="og:locale" content="en_US" />`,
          `<meta property="og:url" content="${url(name)}" />`,
          `<meta property="og:title" content="${title}" />`,
          `<meta property="og:description" content="${description}" />`,
          `<meta property="og:image" content="${SITE}/og.png" />`,
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
          `<meta property="og:image:alt" content="Nocap Cloud: deploys, no cap. The panel on a dark background." />`,
          `<meta name="twitter:card" content="summary_large_image" />`,
          `<meta name="twitter:title" content="${title}" />`,
          `<meta name="twitter:description" content="${description}" />`,
          `<meta name="twitter:image" content="${SITE}/og.png" />`,
          `<link rel="apple-touch-icon" href="./apple-touch-icon.png" />`,
          `<link rel="manifest" href="./site.webmanifest" />`,
        ];
        if (name === "index") {
          tags.push(
            `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`,
          );
        }
        return html.replace("</head>", `  ${tags.join("\n    ")}\n  </head>`);
      },
    },
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      const entries = pageNames
        .map(
          (name) =>
            `  <url><loc>${escapeAttr(url(name))}</loc><lastmod>${today}</lastmod><priority>${name === "index" ? "1.0" : "0.7"}</priority></url>`,
        )
        .join("\n");
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`,
      });
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
  plugins: [includes(), tailwindcss(), seo(pages)],
  server: { port: 5174 },
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page, resolve(root, `${page}.html`)])),
    },
  },
});
