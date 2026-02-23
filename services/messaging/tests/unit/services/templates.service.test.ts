import { describe, it, expect } from "vitest";
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  ListTemplatesQuerySchema,
} from "../../../src/services/templates.service.js";

describe("CreateTemplateSchema", () => {
  it("validates a minimal template", () => {
    const result = CreateTemplateSchema.parse({ name: "Welcome Email" });
    expect(result.name).toBe("Welcome Email");
    expect(result.kind).toBe("email");
    expect(result.body).toBe("");
  });

  it("defaults kind to email", () => {
    const result = CreateTemplateSchema.parse({ name: "T" });
    expect(result.kind).toBe("email");
  });

  it("accepts all valid kinds", () => {
    for (const kind of ["email", "sms", "whatsapp"] as const) {
      const result = CreateTemplateSchema.parse({ name: "T", kind });
      expect(result.kind).toBe(kind);
    }
  });

  it("rejects invalid kind", () => {
    expect(() => CreateTemplateSchema.parse({ name: "T", kind: "push" })).toThrow();
  });

  it("validates fromEmail as valid email", () => {
    expect(() =>
      CreateTemplateSchema.parse({ name: "T", fromEmail: "not-an-email" })
    ).toThrow();
  });

  it("accepts valid fromEmail", () => {
    const result = CreateTemplateSchema.parse({
      name: "T",
      fromEmail: "sender@example.com",
    });
    expect(result.fromEmail).toBe("sender@example.com");
  });

  it("requires name", () => {
    expect(() => CreateTemplateSchema.parse({})).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => CreateTemplateSchema.parse({ name: "" })).toThrow();
  });

  it("accepts full template with all fields", () => {
    const result = CreateTemplateSchema.parse({
      name: "Invite",
      kind: "email",
      subject: "You're invited to {{eventName}}",
      body: "Dear {{firstName}}, please join us.",
      bodyHtml: "<p>Dear {{firstName}}</p>",
      fromName: "Acme Events",
      fromEmail: "noreply@acme.com",
      replyTo: "events@acme.com",
    });
    expect(result.subject).toBe("You're invited to {{eventName}}");
    expect(result.fromName).toBe("Acme Events");
  });
});

describe("UpdateTemplateSchema", () => {
  it("all fields optional", () => {
    expect(UpdateTemplateSchema.parse({})).toEqual({});
  });

  it("accepts partial update", () => {
    const result = UpdateTemplateSchema.parse({ subject: "Updated Subject" });
    expect(result.subject).toBe("Updated Subject");
  });

  it("rejects invalid email in partial update", () => {
    expect(() => UpdateTemplateSchema.parse({ fromEmail: "bad" })).toThrow();
  });
});

describe("ListTemplatesQuerySchema", () => {
  it("defaults page and perPage", () => {
    const result = ListTemplatesQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(25);
  });

  it("coerces string numbers", () => {
    const result = ListTemplatesQuerySchema.parse({ page: "2", perPage: "10" });
    expect(result.page).toBe(2);
    expect(result.perPage).toBe(10);
  });

  it("caps perPage at 100", () => {
    expect(() => ListTemplatesQuerySchema.parse({ perPage: "200" })).toThrow();
  });

  it("filters by kind", () => {
    const result = ListTemplatesQuerySchema.parse({ kind: "sms" });
    expect(result.kind).toBe("sms");
  });

  it("rejects invalid kind", () => {
    expect(() => ListTemplatesQuerySchema.parse({ kind: "push" })).toThrow();
  });

  it("filters by status", () => {
    const result = ListTemplatesQuerySchema.parse({ status: "active" });
    expect(result.status).toBe("active");
  });
});
