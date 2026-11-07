import { describe, expect, it } from "vitest";
import { fakeVerify, hashPassword, verifyPassword } from "../src/auth/password";

describe("passwords", () => {
  it("hashes with argon2id and verifies the right password", async () => {
    const hash = await hashPassword("a long enough password");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "a long enough password")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("a long enough password");
    expect(await verifyPassword(hash, "another password!!")).toBe(false);
  });

  it("returns false instead of throwing on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("fakeVerify always fails", async () => {
    expect(await fakeVerify("anything")).toBe(false);
  });
});
