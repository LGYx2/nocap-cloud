import { describe, expect, it } from "vitest";
import { parseLog } from "./log-sections";

const failed = [
  "Deployment d3000000 of Admin console",
  "",
  "==> Cloning https://github.com/acme/admin.git (main)",
  "Commit fc9630d: Upgrade to Node 22",
  "",
  "==> Building Dockerfile",
  "#8 [6/6] RUN pnpm build",
  "#8 ERROR: src/routes/users.ts(42,7): Property 'role' does not exist",
  "",
  "==> Failed: build failed (exit code 1). See the log for details.",
  "",
].join("\n");

describe("parseLog", () => {
  it("groups steps, drops the blank lines between them and finds the errors", () => {
    const log = parseLog(failed, false);
    expect(log.sections.map((s) => [s.title, s.status, s.lines.length])).toEqual([
      [null, "none", 1],
      ["Cloning https://github.com/acme/admin.git (main)", "done", 1],
      ["Building Dockerfile", "failed", 2],
    ]);
    expect(log.result).toMatchObject({ kind: "failed", n: 5 });
    expect(log.errors).toEqual([4, 5]);
    expect(log.count).toBe(5);
  });

  it("marks the last step running while the build goes on", () => {
    const log = parseLog(
      "==> Cloning x\nCloning into 'app'\n==> Building Dockerfile\n#1 load",
      true,
    );
    expect(log.sections.map((s) => s.status)).toEqual(["done", "running"]);
    expect(log.result).toBeNull();
  });

  it("keeps plain app output as one section without a title", () => {
    const log = parseLog("GET / 200 3ms\n\nGET /health 200 1ms\n", false);
    expect(log.sections).toHaveLength(1);
    expect(log.sections[0]?.title).toBeNull();
    expect(log.count).toBe(3);
  });
});
