import { describe, it, expect } from "vitest";
import {
  CreateMessageSchema,
  UpdateMessageSchema,
  ScheduleMessageSchema,
  SetRecipientsSchema,
  ListMessagesQuerySchema,
} from "../../../src/services/messages.service.js";

describe("CreateMessageSchema", () => {
  it("validates a minimal message", () => {
    const result = CreateMessageSchema.parse({ name: "Welcome" });
    expect(result.name).toBe("Welcome");
    expect(result.kind).toBe("email");
    expect(result.triggerKind).toBe("manual");
    expect(result.body).toBe("");
  });

  it("requires name", () => {
    expect(() => CreateMessageSchema.parse({})).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => CreateMessageSchema.parse({ name: "" })).toThrow();
  });

  it("accepts all valid kinds", () => {
    for (const kind of ["email", "sms", "whatsapp"] as const) {
      const result = CreateMessageSchema.parse({ name: "M", kind });
      expect(result.kind).toBe(kind);
    }
  });

  it("accepts all valid triggerKinds", () => {
    const kinds = [
      "manual",
      "scheduled",
      "event_trigger",
      "rsvp_trigger",
      "date_trigger",
    ] as const;
    for (const triggerKind of kinds) {
      const result = CreateMessageSchema.parse({ name: "M", triggerKind });
      expect(result.triggerKind).toBe(triggerKind);
    }
  });

  it("rejects invalid triggerKind", () => {
    expect(() =>
      CreateMessageSchema.parse({ name: "M", triggerKind: "webhook" })
    ).toThrow();
  });

  it("accepts scheduledAt ISO datetime", () => {
    const result = CreateMessageSchema.parse({
      name: "M",
      triggerKind: "scheduled",
      scheduledAt: "2026-06-01T12:00:00Z",
    });
    expect(result.scheduledAt).toBe("2026-06-01T12:00:00Z");
  });

  it("rejects malformed scheduledAt", () => {
    expect(() =>
      CreateMessageSchema.parse({ name: "M", scheduledAt: "not-a-date" })
    ).toThrow();
  });

  it("defaults triggerConfig to empty object", () => {
    const result = CreateMessageSchema.parse({ name: "M" });
    expect(result.triggerConfig).toEqual({});
  });

  it("accepts full message", () => {
    const result = CreateMessageSchema.parse({
      name: "Invite",
      kind: "email",
      eventId: "evt_abc123",
      templateId: "tpl_xyz456",
      subject: "You're invited",
      body: "Hello {{firstName}}",
      fromEmail: "no-reply@example.com",
    });
    expect(result.eventId).toBe("evt_abc123");
    expect(result.subject).toBe("You're invited");
  });
});

describe("UpdateMessageSchema", () => {
  it("all fields optional", () => {
    expect(UpdateMessageSchema.parse({})).toEqual({});
  });

  it("accepts partial update", () => {
    const result = UpdateMessageSchema.parse({ subject: "New Subject" });
    expect(result.subject).toBe("New Subject");
  });
});

describe("ScheduleMessageSchema", () => {
  it("requires scheduledAt", () => {
    expect(() => ScheduleMessageSchema.parse({})).toThrow();
  });

  it("accepts valid datetime", () => {
    const result = ScheduleMessageSchema.parse({ scheduledAt: "2026-09-01T09:00:00Z" });
    expect(result.scheduledAt).toBe("2026-09-01T09:00:00Z");
  });

  it("rejects non-ISO dates", () => {
    expect(() =>
      ScheduleMessageSchema.parse({ scheduledAt: "September 1st 2026" })
    ).toThrow();
  });
});

describe("SetRecipientsSchema", () => {
  it("defaults to empty arrays", () => {
    const result = SetRecipientsSchema.parse({});
    expect(result.guestIds).toEqual([]);
    expect(result.listIds).toEqual([]);
  });

  it("accepts guest IDs", () => {
    const result = SetRecipientsSchema.parse({
      guestIds: ["gst_a", "gst_b"],
    });
    expect(result.guestIds).toHaveLength(2);
  });

  it("accepts list IDs with default kind", () => {
    const result = SetRecipientsSchema.parse({
      listIds: [{ listId: "lst_1" }],
    });
    expect(result.listIds[0]!.listKind).toBe("event_list");
  });

  it("accepts mixed guestIds and listIds", () => {
    const result = SetRecipientsSchema.parse({
      guestIds: ["gst_1"],
      listIds: [{ listId: "lst_1", listKind: "contact_list" }],
    });
    expect(result.guestIds).toHaveLength(1);
    expect(result.listIds[0]!.listKind).toBe("contact_list");
  });
});

describe("ListMessagesQuerySchema", () => {
  it("defaults page and perPage", () => {
    const result = ListMessagesQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(25);
  });

  it("coerces string numbers", () => {
    const result = ListMessagesQuerySchema.parse({ page: "3", perPage: "50" });
    expect(result.page).toBe(3);
    expect(result.perPage).toBe(50);
  });

  it("rejects perPage over 100", () => {
    expect(() => ListMessagesQuerySchema.parse({ perPage: "101" })).toThrow();
  });

  it("accepts all valid statuses", () => {
    const statuses = [
      "draft",
      "scheduled",
      "sending",
      "sent",
      "paused",
      "cancelled",
      "failed",
    ] as const;
    for (const status of statuses) {
      expect(ListMessagesQuerySchema.parse({ status }).status).toBe(status);
    }
  });

  it("rejects invalid status", () => {
    expect(() => ListMessagesQuerySchema.parse({ status: "deleted" })).toThrow();
  });

  it("accepts eventId filter", () => {
    const result = ListMessagesQuerySchema.parse({ eventId: "evt_123" });
    expect(result.eventId).toBe("evt_123");
  });
});
