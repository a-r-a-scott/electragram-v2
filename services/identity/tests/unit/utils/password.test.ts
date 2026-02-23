import { describe, it, expect } from "vitest";

import { hashPassword, verifyPassword } from "../../../src/utils/password.js";

describe("hashPassword", () => {
  it("returns a bcrypt hash starting with $2b$", async () => {
    const hash = await hashPassword("mypassword");
    expect(hash).toMatch(/^\$2b\$/);
  });

  it("produces different hashes for the same password (salted)", async () => {
    const h1 = await hashPassword("mypassword");
    const h2 = await hashPassword("mypassword");
    expect(h1).not.toBe(h2);
  });
});

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const hash = await hashPassword("correct-horse");
    const result = await verifyPassword("correct-horse", hash);
    expect(result).toBe(true);
  });

  it("returns false for incorrect password", async () => {
    const hash = await hashPassword("correct-horse");
    const result = await verifyPassword("wrong-horse", hash);
    expect(result).toBe(false);
  });

  it("returns false for empty password", async () => {
    const hash = await hashPassword("password");
    const result = await verifyPassword("", hash);
    expect(result).toBe(false);
  });
});
