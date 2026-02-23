import { describe, it, expect } from "vitest";
import {
  generateId,
  generateToken,
  hashEmail,
  buildGuestDupeKey,
  buildSearchText,
} from "../../../src/utils/id.js";

describe("generateId", () => {
  it("generates id with prefix", () => {
    const id = generateId("evt");
    expect(id).toMatch(/^evt_[A-Za-z0-9]{12}$/);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId("evt")));
    expect(ids.size).toBe(100);
  });

  it("uses the provided prefix", () => {
    expect(generateId("gst")).toMatch(/^gst_/);
    expect(generateId("eg")).toMatch(/^eg_/);
    expect(generateId("frm")).toMatch(/^frm_/);
    expect(generateId("pge")).toMatch(/^pge_/);
  });
});

describe("generateToken", () => {
  it("generates a 40 character token", () => {
    const token = generateToken();
    expect(token).toHaveLength(40);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateToken));
    expect(tokens.size).toBe(50);
  });

  it("contains only alphanumeric characters", () => {
    expect(generateToken()).toMatch(/^[A-Za-z0-9]{40}$/);
  });
});

describe("hashEmail", () => {
  it("returns 64 character sha256 hex", () => {
    expect(hashEmail("test@example.com")).toHaveLength(64);
  });

  it("is case-insensitive", () => {
    expect(hashEmail("Test@Example.COM")).toBe(hashEmail("test@example.com"));
  });

  it("trims whitespace", () => {
    expect(hashEmail("  test@example.com  ")).toBe(hashEmail("test@example.com"));
  });

  it("is deterministic", () => {
    const hash = hashEmail("alice@example.com");
    expect(hashEmail("alice@example.com")).toBe(hash);
  });

  it("produces different hashes for different emails", () => {
    expect(hashEmail("a@example.com")).not.toBe(hashEmail("b@example.com"));
  });
});

describe("buildGuestDupeKey", () => {
  it("creates consistent lowercase key", () => {
    const key = buildGuestDupeKey("Alice", "Smith", "alice@example.com");
    expect(key).toBe("alice|smith|alice@example.com");
  });

  it("handles missing email", () => {
    const key = buildGuestDupeKey("Alice", "Smith");
    expect(key).toBe("alice|smith|");
  });

  it("normalises whitespace and case", () => {
    expect(buildGuestDupeKey("  ALICE  ", "  SMITH  ", "ALICE@EXAMPLE.COM")).toBe(
      "alice|smith|alice@example.com"
    );
  });
});

describe("buildSearchText", () => {
  it("joins non-empty strings with spaces", () => {
    expect(buildSearchText("Alice", "Smith", "alice@example.com")).toBe(
      "Alice Smith alice@example.com"
    );
  });

  it("filters out null and undefined", () => {
    expect(buildSearchText("Alice", null, undefined, "Smith")).toBe(
      "Alice Smith"
    );
  });

  it("returns empty string when all parts are empty", () => {
    expect(buildSearchText(null, undefined)).toBe("");
  });
});
