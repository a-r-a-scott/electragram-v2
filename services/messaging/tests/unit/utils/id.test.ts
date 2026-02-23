import { describe, it, expect } from "vitest";
import {
  generateId,
  buildSearchText,
  interpolate,
  extractVariableKeys,
} from "../../../src/utils/id.js";

describe("generateId", () => {
  it("generates id with prefix", () => {
    expect(generateId("msg")).toMatch(/^msg_[A-Za-z0-9]{12}$/);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId("msg")));
    expect(ids.size).toBe(100);
  });

  it("supports different prefixes", () => {
    expect(generateId("tpl")).toMatch(/^tpl_/);
    expect(generateId("rcp")).toMatch(/^rcp_/);
    expect(generateId("job")).toMatch(/^job_/);
    expect(generateId("uns")).toMatch(/^uns_/);
  });
});

describe("buildSearchText", () => {
  it("joins non-empty parts", () => {
    expect(buildSearchText("Welcome", "Alice", "event")).toBe("Welcome Alice event");
  });

  it("filters nulls and undefineds", () => {
    expect(buildSearchText("Welcome", null, undefined, "event")).toBe("Welcome event");
  });

  it("returns empty string for all-empty input", () => {
    expect(buildSearchText(null, undefined)).toBe("");
  });
});

describe("interpolate", () => {
  it("replaces single placeholder", () => {
    expect(interpolate("Hello {{firstName}}", { firstName: "Alice" })).toBe("Hello Alice");
  });

  it("replaces multiple placeholders", () => {
    expect(
      interpolate("Hello {{firstName}} {{lastName}}", {
        firstName: "Alice",
        lastName: "Smith",
      })
    ).toBe("Hello Alice Smith");
  });

  it("replaces same placeholder used twice", () => {
    expect(
      interpolate("{{name}} is {{name}}", { name: "Alice" })
    ).toBe("Alice is Alice");
  });

  it("handles whitespace around key names", () => {
    expect(interpolate("Hello {{ firstName }}", { firstName: "Alice" })).toBe(
      "Hello Alice"
    );
  });

  it("leaves unknown placeholders empty", () => {
    expect(interpolate("Hello {{unknown}}", {})).toBe("Hello ");
  });

  it("replaces null values with empty string", () => {
    expect(interpolate("Hello {{name}}", { name: null })).toBe("Hello ");
  });

  it("returns original string when no placeholders", () => {
    expect(interpolate("Hello World", { name: "Alice" })).toBe("Hello World");
  });

  it("handles empty template", () => {
    expect(interpolate("", { name: "Alice" })).toBe("");
  });
});

describe("extractVariableKeys", () => {
  it("extracts keys from template", () => {
    const keys = extractVariableKeys("Hello {{firstName}}, your event {{eventName}}");
    expect(keys).toContain("firstName");
    expect(keys).toContain("eventName");
    expect(keys).toHaveLength(2);
  });

  it("deduplicates repeated keys", () => {
    const keys = extractVariableKeys("{{name}} and {{name}} again");
    expect(keys).toEqual(["name"]);
  });

  it("trims whitespace in keys", () => {
    const keys = extractVariableKeys("Hello {{ name }}");
    expect(keys).toContain("name");
  });

  it("returns empty array for no placeholders", () => {
    expect(extractVariableKeys("No placeholders here")).toEqual([]);
  });

  it("handles empty string", () => {
    expect(extractVariableKeys("")).toEqual([]);
  });
});
