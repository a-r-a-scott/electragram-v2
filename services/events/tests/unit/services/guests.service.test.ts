import { describe, it, expect } from "vitest";
import {
  CreateGuestSchema,
  UpdateGuestSchema,
  AddGuestToEventSchema,
  BulkAddGuestsSchema,
  CheckInGuestSchema,
  UpdateGuestStatusSchema,
  ListGuestsQuerySchema,
} from "../../../src/services/guests.service.js";

describe("CreateGuestSchema", () => {
  it("validates a full guest", () => {
    const result = CreateGuestSchema.parse({
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      phone: "+44123456789",
      whatsapp: "+44123456789",
      preferredChannel: "email",
      emailOptin: true,
      customFields: { company: "ACME" },
    });
    expect(result.firstName).toBe("Alice");
    expect(result.emailOptin).toBe(true);
  });

  it("requires firstName", () => {
    expect(() =>
      CreateGuestSchema.parse({ lastName: "Smith" })
    ).toThrow();
  });

  it("requires lastName", () => {
    expect(() =>
      CreateGuestSchema.parse({ firstName: "Alice" })
    ).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      CreateGuestSchema.parse({ firstName: "Alice", lastName: "Smith", email: "bad" })
    ).toThrow();
  });

  it("rejects invalid preferredChannel", () => {
    expect(() =>
      CreateGuestSchema.parse({
        firstName: "Alice",
        lastName: "Smith",
        preferredChannel: "fax",
      })
    ).toThrow();
  });

  it("defaults emailOptin to true", () => {
    const result = CreateGuestSchema.parse({
      firstName: "Alice",
      lastName: "Smith",
    });
    expect(result.emailOptin).toBe(true);
  });

  it("defaults customFields to empty object", () => {
    const result = CreateGuestSchema.parse({
      firstName: "Alice",
      lastName: "Smith",
    });
    expect(result.customFields).toEqual({});
  });
});

describe("UpdateGuestSchema", () => {
  it("all fields are optional", () => {
    const result = UpdateGuestSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects invalid email in partial update", () => {
    expect(() => UpdateGuestSchema.parse({ email: "bad-email" })).toThrow();
  });
});

describe("AddGuestToEventSchema", () => {
  it("requires guestId", () => {
    expect(() => AddGuestToEventSchema.parse({})).toThrow();
  });

  it("defaults status to pending", () => {
    const result = AddGuestToEventSchema.parse({ guestId: "gst_123" });
    expect(result.status).toBe("pending");
    expect(result.attendeesCount).toBe(1);
  });

  it("rejects invalid status", () => {
    expect(() =>
      AddGuestToEventSchema.parse({ guestId: "gst_123", status: "deleted" })
    ).toThrow();
  });
});

describe("BulkAddGuestsSchema", () => {
  it("requires at least one guestId", () => {
    expect(() => BulkAddGuestsSchema.parse({ guestIds: [] })).toThrow();
  });

  it("rejects more than 500 guests", () => {
    expect(() =>
      BulkAddGuestsSchema.parse({
        guestIds: Array.from({ length: 501 }, (_, i) => `gst_${i}`),
      })
    ).toThrow();
  });

  it("accepts 500 guests", () => {
    const result = BulkAddGuestsSchema.parse({
      guestIds: Array.from({ length: 500 }, (_, i) => `gst_${i}`),
    });
    expect(result.guestIds).toHaveLength(500);
  });
});

describe("CheckInGuestSchema", () => {
  it("all fields optional", () => {
    const result = CheckInGuestSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts seat and table numbers", () => {
    const result = CheckInGuestSchema.parse({
      seatNumber: "A1",
      tableNumber: "5",
    });
    expect(result.seatNumber).toBe("A1");
    expect(result.tableNumber).toBe("5");
  });
});

describe("UpdateGuestStatusSchema", () => {
  it("requires status", () => {
    expect(() => UpdateGuestStatusSchema.parse({})).toThrow();
  });

  it("accepts all valid statuses", () => {
    const statuses = [
      "pending",
      "invited",
      "accepted",
      "declined",
      "archived",
      "registered",
      "unsubscribed",
    ] as const;
    for (const status of statuses) {
      const result = UpdateGuestStatusSchema.parse({ status });
      expect(result.status).toBe(status);
    }
  });

  it("rejects invalid status", () => {
    expect(() =>
      UpdateGuestStatusSchema.parse({ status: "ghosted" })
    ).toThrow();
  });

  it("accepts optional attendanceStatus", () => {
    const result = UpdateGuestStatusSchema.parse({
      status: "accepted",
      attendanceStatus: "attending",
    });
    expect(result.attendanceStatus).toBe("attending");
  });
});

describe("ListGuestsQuerySchema", () => {
  it("defaults page and perPage", () => {
    const result = ListGuestsQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(25);
  });

  it("coerces string numbers", () => {
    const result = ListGuestsQuerySchema.parse({ page: "3", perPage: "10" });
    expect(result.page).toBe(3);
    expect(result.perPage).toBe(10);
  });

  it("rejects perPage over 100", () => {
    expect(() => ListGuestsQuerySchema.parse({ perPage: "101" })).toThrow();
  });
});
