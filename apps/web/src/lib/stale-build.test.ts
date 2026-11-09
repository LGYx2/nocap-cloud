import { describe, expect, it } from "vitest";
import { isStaleBuildError } from "./stale-build";

describe("isStaleBuildError", () => {
  it("recognises a missing page file in every browser", () => {
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(
      isStaleBuildError(
        new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"),
      ),
    ).toBe(true);
    expect(isStaleBuildError(new Error("error loading dynamically imported module"))).toBe(true);
  });

  it("leaves other errors alone", () => {
    expect(isStaleBuildError(new Error("Project not found"))).toBe(false);
  });
});
