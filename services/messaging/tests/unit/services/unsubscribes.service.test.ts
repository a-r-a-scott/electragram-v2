import { describe, it, expect } from "vitest";
import {
  CreateUnsubscribeSchema,
  ListUnsubscribesQuerySchema,
} from "../../../src/services/unsubscribes.service.js";

describe("CreateUnsubscribeSchema", () => {
  it("accepts email-only unsubscribe", () => {
    const result = CreateUnsubscribeSchema.parse({ email: "alice@example.com" });
    expect(result.email).toBe("alice@example.com");
    expect(result.isGlobal).toBe(false);
  });

  it("accepts phone-only unsubscribe", () => {
    const result = CreateUnsubscribeSchema.parse({ phone: "+44123456789" });
    expect(result.phone).toBe("+44123456789");
  });

  it("accepts guestId-only unsubscribe", () => {
    const result = CreateUnsubscribeSchema.parse({ guestId: "gst_abc" });
    expect(result.guestId).toBe("gst_abc");
  });

  it("rejects when none of email/phone/guestId provided", () => {
    expect(() => CreateUnsubscribeSchema.parse({})).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() => CreateUnsubscribeSchema.parse({ email: "not-an-email" })).toThrow();
  });

  it("defaults isGlobal to false", () => {
    const result = CreateUnsubscribeSchema.parse({ email: "a@b.com" });
    expect(result.isGlobal).toBe(false);
  });

  it("accepts isGlobal true", () => {
    const result = CreateUnsubscribeSchema.parse({
      email: "a@b.com",
      isGlobal: true,
    });
    expect(result.isGlobal).toBe(true);
  });

  it("accepts optional reason", () => {
    const result = CreateUnsubscribeSchema.parse({
      email: "a@b.com",
      reason: "No longer interested",
    });
    expect(result.reason).toBe("No longer interested");
  });

  it("accepts messageId linkage", () => {
    const result = CreateUnsubscribeSchema.parse({
      email: "a@b.com",
      messageId: "msg_abc123",
    });
    expect(result.messageId).toBe("msg_abc123");
  });

  it("accepts all three fields together", () => {
    const result = CreateUnsubscribeSchema.parse({
      email: "a@b.com",
      phone: "+1234567890",
      guestId: "gst_abc",
      isGlobal: true,
    });
    expect(result.email).toBe("a@b.com");
    expect(result.guestId).toBe("gst_abc");
  });
});

describe("ListUnsubscribesQuerySchema", () => {
  it("defaults page and perPage", () => {
    const result = ListUnsubscribesQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(25);
  });

  it("coerces string numbers", () => {
    const result = ListUnsubscribesQuerySchema.parse({ page: "2", perPage: "10" });
    expect(result.page).toBe(2);
    expect(result.perPage).toBe(10);
  });

  it("rejects perPage above 100", () => {
    expect(() => ListUnsubscribesQuerySchema.parse({ perPage: "200" })).toThrow();
  });
});
