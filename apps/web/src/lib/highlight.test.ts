import { describe, expect, it } from "vitest";
import { highlightLine, splitUrl } from "./highlight";

const kinds = (line: string) =>
  highlightLine(line)
    .tokens.filter((t) => t.kind)
    .map((t) => `${t.kind}:${t.text}`);

describe("log highlighting", () => {
  it("keeps the text exactly as it was", () => {
    const line = '2026-11-07T12:00:01.123Z GET /api/v1/orders 200 12ms "ok"';
    expect(
      highlightLine(line)
        .tokens.map((t) => t.text)
        .join(""),
    ).toBe(line);
  });

  it("colors timestamps, methods, status codes and durations", () => {
    expect(kinds("2026-11-07T12:00:01.123Z GET /health 404 3ms")).toEqual([
      "dim:2026-11-07T12:00:01.123Z",
      "accent:GET",
      "warn:404",
      "dim:3ms",
    ]);
  });

  it("only treats three digit numbers as status codes on HTTP lines", () => {
    expect(kinds("#6 Packages: +312")).toEqual(["accent:#6"]);
  });

  it("marks steps, errors and warnings", () => {
    expect(highlightLine("==> Building Dockerfile").kind).toBe("step");
    expect(highlightLine("==> Failed: build failed").kind).toBe("step-failed");
    expect(highlightLine("==> Done. The app is live.").kind).toBe("step-done");
    expect(highlightLine("#8 ERROR: Property 'role' does not exist").kind).toBe("error");
    expect(highlightLine("npm WARN deprecated inflight@1.0.6").kind).toBe("warn");
    expect(highlightLine("Listening on 0.0.0.0:3000").kind).toBe("plain");
  });

  it("does not color good news on an error line", () => {
    expect(kinds('#8 ERROR: "pnpm build" did not complete successfully')).toEqual([
      "accent:#8",
      "error:ERROR:",
      'string:"pnpm build"',
    ]);
  });

  it("finds URLs and levels", () => {
    expect(kinds("Domains: https://api.example.com, LOG: ready")).toEqual([
      "link:https://api.example.com",
      "info:LOG:",
      "ok:ready",
    ]);
  });
});

describe("splitUrl", () => {
  it("separates the password from the rest of a connection URL", () => {
    expect(splitUrl("postgresql://nocap:s3cret@nocap-db-1a2b3c4d:5432/app")).toEqual([
      { text: "postgresql://", kind: "scheme" },
      { text: "nocap:" },
      { text: "s3cret", kind: "secret" },
      { text: "@" },
      { text: "nocap-db-1a2b3c4d", kind: "host" },
      { text: ":5432/app", kind: "rest" },
    ]);
  });

  it("handles URLs without credentials", () => {
    expect(splitUrl("https://panel.example.com/api/hooks/deploy/abc")).toEqual([
      { text: "https://", kind: "scheme" },
      { text: "panel.example.com", kind: "host" },
      { text: "/api/hooks/deploy/abc", kind: "rest" },
    ]);
  });
});
