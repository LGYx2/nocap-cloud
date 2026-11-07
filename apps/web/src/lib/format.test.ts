import { describe, expect, it } from "vitest";
import { initials, timeAgo } from "./format";

describe("initials", () => {
  it("uses the first and last name", () => {
    expect(initials("Ana Maria Silva")).toBe("AS");
  });

  it("uses two letters of a single name", () => {
    expect(initials("ana")).toBe("AN");
  });

  it("falls back to a question mark", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-11-07T12:00:00Z");

  it("says just now for the last minute", () => {
    expect(timeAgo("2026-11-07T11:59:30Z", now)).toBe("just now");
  });

  it("uses the largest unit that fits", () => {
    expect(timeAgo("2026-11-07T09:00:00Z", now)).toBe("3 hours ago");
    expect(timeAgo("2026-11-06T12:00:00Z", now)).toBe("yesterday");
  });
});
