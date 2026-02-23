import { describe, it, expect } from "vitest";
import {
  CreatePageSchema,
  UpdatePageSchema,
} from "../../../src/services/pages.service.js";

describe("CreatePageSchema", () => {
  it("validates a valid page", () => {
    const result = CreatePageSchema.parse({ name: "Registration" });
    expect(result.name).toBe("Registration");
    expect(result.kind).toBe("registration");
  });

  it("accepts all page kinds", () => {
    const kinds = ["registration", "information", "confirmation"] as const;
    for (const kind of kinds) {
      const result = CreatePageSchema.parse({ name: "Page", kind });
      expect(result.kind).toBe(kind);
    }
  });

  it("rejects invalid kind", () => {
    expect(() =>
      CreatePageSchema.parse({ name: "Page", kind: "payment" })
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => CreatePageSchema.parse({ name: "" })).toThrow();
  });

  it("requires name", () => {
    expect(() => CreatePageSchema.parse({})).toThrow();
  });

  it("accepts optional slug", () => {
    const result = CreatePageSchema.parse({ name: "Reg", slug: "my-event-2026" });
    expect(result.slug).toBe("my-event-2026");
  });

  it("accepts optional templateId", () => {
    const result = CreatePageSchema.parse({
      name: "Reg",
      templateId: "tpl_abc123456789",
    });
    expect(result.templateId).toBe("tpl_abc123456789");
  });
});

describe("UpdatePageSchema", () => {
  it("all fields are optional", () => {
    expect(UpdatePageSchema.parse({})).toEqual({});
  });

  it("accepts status update", () => {
    const result = UpdatePageSchema.parse({ status: "active" });
    expect(result.status).toBe("active");
  });

  it("rejects invalid status", () => {
    expect(() => UpdatePageSchema.parse({ status: "published" })).toThrow();
  });

  it("accepts isActive toggle", () => {
    const result = UpdatePageSchema.parse({ isActive: true });
    expect(result.isActive).toBe(true);
  });
});
