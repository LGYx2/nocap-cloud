// Recognises the language or framework of a cloned repository from its usual files, so the
// panel can show the right icon. A guess from a few small files; it never runs anything.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { stackFromImage, type StackId } from "@nocap/shared";

const MAX_BYTES = 200_000;

async function read(dir: string, name: string): Promise<string | null> {
  try {
    const text = await readFile(join(dir, name), "utf8");
    return text.slice(0, MAX_BYTES);
  } catch {
    return null;
  }
}

const NODE_FRAMEWORKS: Array<[string, StackId]> = [
  ["next", "nextjs"],
  ["nuxt", "nuxt"],
  ["@nestjs/core", "nestjs"],
  ["astro", "astro"],
  ["@angular/core", "angular"],
  ["@sveltejs/kit", "svelte"],
  ["svelte", "svelte"],
  ["vue", "vue"],
  ["react", "react"],
];

export async function detectStack(dir: string, dockerfilePath: string): Promise<StackId | null> {
  const files = new Set(await readdir(dir).catch(() => [] as string[]));
  const has = (name: string) => files.has(name);

  if (has("package.json")) {
    let deps: Record<string, unknown> = {};
    try {
      const pkg = JSON.parse((await read(dir, "package.json")) ?? "{}") as {
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
      };
      deps = { ...pkg.devDependencies, ...pkg.dependencies };
    } catch {
      // Not valid JSON: still a Node project.
    }
    const framework = NODE_FRAMEWORKS.find(([name]) => name in deps)?.[1];
    if (framework) return framework;
    if (has("bun.lockb") || has("bun.lock")) return "bun";
    return "node";
  }
  if (has("deno.json") || has("deno.jsonc")) return "deno";

  if (has("manage.py") || has("requirements.txt") || has("pyproject.toml") || has("Pipfile")) {
    const text = [
      await read(dir, "requirements.txt"),
      await read(dir, "pyproject.toml"),
      await read(dir, "Pipfile"),
    ]
      .join("\n")
      .toLowerCase();
    if (has("manage.py") || text.includes("django")) return "django";
    if (text.includes("fastapi")) return "fastapi";
    if (text.includes("flask")) return "flask";
    return "python";
  }
  if (has("composer.json")) {
    return ((await read(dir, "composer.json")) ?? "").includes("laravel/framework")
      ? "laravel"
      : "php";
  }
  if (has("Gemfile")) {
    return /gem ["']rails["']/.test((await read(dir, "Gemfile")) ?? "") ? "rails" : "ruby";
  }
  if (has("go.mod")) return "go";
  if (has("Cargo.toml")) return "rust";
  if (has("pom.xml") || has("build.gradle") || has("build.gradle.kts")) {
    const text = [
      await read(dir, "pom.xml"),
      await read(dir, "build.gradle"),
      await read(dir, "build.gradle.kts"),
    ].join("\n");
    return text.includes("spring-boot") || text.includes("springframework") ? "spring" : "java";
  }
  if ([...files].some((name) => /\.(csproj|fsproj|sln)$/.test(name))) return "dotnet";
  if (has("mix.exs")) return "elixir";

  // Nothing recognisable: use the image the Dockerfile ends on.
  const dockerfile = await read(dir, dockerfilePath);
  const from = [...(dockerfile ?? "").matchAll(/^FROM\s+(?:--\S+\s+)?(\S+)/gim)].at(-1)?.[1];
  if (from) {
    const stack = stackFromImage(from);
    if (stack !== "docker") return stack;
  }
  return null;
}
