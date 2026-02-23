import { describe, it, expect } from "vitest";

import { generateId, generateApiKey, generateSlug } from "../../../src/utils/id.js";

describe("generateId", () => {
  it("returns a string with the given prefix", () => {
    const id = generateId("usr");
    expect(id).toMatch(/^usr_/);
  });

  it("generates unique IDs", () => {
    const ids = Array.from({ length: 100 }, () => generateId("usr"));
    const unique = new Set(ids);
    expect(unique.size).toBe(100);
  });

  it("generates IDs for different prefixes", () => {
    expect(generateId("acc")).toMatch(/^acc_/);
    expect(generateId("ses")).toMatch(/^ses_/);
    expect(generateId("acu")).toMatch(/^acu_/);
  });
});

describe("generateApiKey", () => {
  it("generates a 40-character alphanumeric key", () => {
    const key = generateApiKey();
    expect(key).toHaveLength(40);
    expect(key).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("generates unique keys", () => {
    const keys = Array.from({ length: 100 }, () => generateApiKey());
    const unique = new Set(keys);
    expect(unique.size).toBe(100);
  });
});

describe("generateSlug", () => {
  it("lowercases and hyphenates words", () => {
    expect(generateSlug("Acme Corp")).toBe("acme-corp");
  });

  it("removes leading and trailing hyphens", () => {
    expect(generateSlug("  My Company  ")).toBe("my-company");
  });

  it("collapses multiple special chars into one hyphen", () => {
    expect(generateSlug("Hello & World!")).toBe("hello-world");
  });

  it("truncates to 80 characters", () => {
    const long = "A".repeat(200);
    expect(generateSlug(long).length).toBeLessThanOrEqual(80);
  });

  it("handles already-valid slugs", () => {
    expect(generateSlug("my-company")).toBe("my-company");
  });
});
