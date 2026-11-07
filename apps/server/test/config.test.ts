import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("config", () => {
  it("applies defaults", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://x" });
    expect(config.PORT).toBe(3000);
    expect(config.SESSION_DAYS).toBe(14);
    expect(config.NOCAP_VERSION).toBe("dev");
  });

  it("fails with a readable message when DATABASE_URL is missing", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ DATABASE_URL: "postgres://x", PORT: "99999" })).toThrow(/PORT/);
  });
});
