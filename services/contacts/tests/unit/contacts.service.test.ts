import { describe, it, expect } from "vitest";

import {
  hashEmail,
  buildDupeKey,
  buildSearchText,
} from "../../src/services/contacts.service.js";

describe("hashEmail", () => {
  it("returns a 64-character hex string", () => {
    const hash = hashEmail("test@example.com");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("is case-insensitive", () => {
    expect(hashEmail("TEST@EXAMPLE.COM")).toBe(hashEmail("test@example.com"));
  });

  it("trims whitespace", () => {
    expect(hashEmail("  test@example.com  ")).toBe(hashEmail("test@example.com"));
  });

  it("produces different hashes for different emails", () => {
    expect(hashEmail("a@example.com")).not.toBe(hashEmail("b@example.com"));
  });
});

describe("buildDupeKey", () => {
  it("combines first, last, and email lowercase", () => {
    const key = buildDupeKey("Jane", "Doe", "jane@example.com");
    expect(key).toBe("jane|doe|jane@example.com");
  });

  it("handles missing email", () => {
    const key = buildDupeKey("Jane", "Doe");
    expect(key).toBe("jane|doe|");
  });

  it("normalises case", () => {
    expect(buildDupeKey("JANE", "DOE", "JANE@EXAMPLE.COM")).toBe(
      buildDupeKey("jane", "doe", "jane@example.com")
    );
  });
});

describe("buildSearchText", () => {
  it("combines first name, last name, and email", () => {
    const text = buildSearchText("Jane", "Doe", "jane@example.com");
    expect(text).toContain("Jane");
    expect(text).toContain("Doe");
    expect(text).toContain("jane@example.com");
  });

  it("omits undefined email", () => {
    const text = buildSearchText("Jane", "Doe");
    expect(text).toBe("Jane Doe");
  });
});
