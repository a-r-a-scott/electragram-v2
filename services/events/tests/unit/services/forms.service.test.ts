import { describe, it, expect } from "vitest";
import {
  CreateFormSchema,
  UpdateFormSchema,
  FormFieldSchema,
  UpdateFormFieldsSchema,
  SubmitFormResponseSchema,
} from "../../../src/services/forms.service.js";

describe("CreateFormSchema", () => {
  it("validates a valid form", () => {
    const result = CreateFormSchema.parse({ name: "Registration Form" });
    expect(result.name).toBe("Registration Form");
  });

  it("accepts optional description", () => {
    const result = CreateFormSchema.parse({
      name: "Form",
      description: "Sign up here",
    });
    expect(result.description).toBe("Sign up here");
  });

  it("rejects empty name", () => {
    expect(() => CreateFormSchema.parse({ name: "" })).toThrow();
  });

  it("requires name", () => {
    expect(() => CreateFormSchema.parse({})).toThrow();
  });
});

describe("UpdateFormSchema", () => {
  it("all fields optional", () => {
    expect(UpdateFormSchema.parse({})).toEqual({});
  });
});

describe("FormFieldSchema", () => {
  it("defaults kind to text", () => {
    const result = FormFieldSchema.parse({ name: "First Name" });
    expect(result.kind).toBe("text");
    expect(result.isRequired).toBe(false);
    expect(result.position).toBe(0);
  });

  it("accepts all valid kinds", () => {
    const kinds = [
      "text",
      "textarea",
      "email",
      "phone",
      "select",
      "multi_select",
      "checkbox",
      "date",
      "number",
    ] as const;
    for (const kind of kinds) {
      const result = FormFieldSchema.parse({ name: "Field", kind });
      expect(result.kind).toBe(kind);
    }
  });

  it("rejects invalid kind", () => {
    expect(() =>
      FormFieldSchema.parse({ name: "Field", kind: "video" })
    ).toThrow();
  });

  it("accepts rich field definition", () => {
    const result = FormFieldSchema.parse({
      name: "Country",
      kind: "select",
      isRequired: true,
      description: "Your country",
      details: { options: ["UK", "US", "AU"] },
    });
    expect(result.isRequired).toBe(true);
    expect((result.details as any).options).toHaveLength(3);
  });
});

describe("UpdateFormFieldsSchema", () => {
  it("validates a list of fields", () => {
    const result = UpdateFormFieldsSchema.parse({
      fields: [
        { name: "First Name", kind: "text", isRequired: true },
        { name: "Email", kind: "email", isRequired: true },
      ],
    });
    expect(result.fields).toHaveLength(2);
  });

  it("accepts empty fields array (clear form)", () => {
    const result = UpdateFormFieldsSchema.parse({ fields: [] });
    expect(result.fields).toHaveLength(0);
  });

  it("allows optional id for existing fields", () => {
    const result = UpdateFormFieldsSchema.parse({
      fields: [{ id: "fld_abc123456789", name: "Name" }],
    });
    expect(result.fields[0]?.id).toBe("fld_abc123456789");
  });
});

describe("SubmitFormResponseSchema", () => {
  it("requires answers", () => {
    expect(() => SubmitFormResponseSchema.parse({})).toThrow();
  });

  it("validates with answers", () => {
    const result = SubmitFormResponseSchema.parse({
      answers: { firstName: "Alice", dietary: "vegan" },
    });
    expect(result.answers).toEqual({ firstName: "Alice", dietary: "vegan" });
  });

  it("defaults isAdditionalGuest to false", () => {
    const result = SubmitFormResponseSchema.parse({ answers: {} });
    expect(result.isAdditionalGuest).toBe(false);
  });

  it("accepts optional comment", () => {
    const result = SubmitFormResponseSchema.parse({
      answers: {},
      comment: "Arriving late",
    });
    expect(result.comment).toBe("Arriving late");
  });
});
