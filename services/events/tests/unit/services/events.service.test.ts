import { describe, it, expect } from "vitest";
import {
  CreateEventSchema,
  UpdateEventSchema,
  ListEventsQuerySchema,
} from "../../../src/services/events.service.js";

describe("CreateEventSchema", () => {
  it("validates a valid event", () => {
    const result = CreateEventSchema.parse({
      name: "Annual Conference",
      description: "A big event",
      startsAt: "2026-06-01T09:00:00Z",
      endsAt: "2026-06-01T17:00:00Z",
      capacityMax: 200,
      isOpen: true,
    });
    expect(result.name).toBe("Annual Conference");
    expect(result.isOpen).toBe(true);
  });

  it("defaults isOpen to true", () => {
    const result = CreateEventSchema.parse({ name: "Test" });
    expect(result.isOpen).toBe(true);
  });

  it("rejects empty name", () => {
    expect(() => CreateEventSchema.parse({ name: "" })).toThrow();
  });

  it("rejects name exceeding 255 chars", () => {
    expect(() =>
      CreateEventSchema.parse({ name: "a".repeat(256) })
    ).toThrow();
  });

  it("requires at least a name", () => {
    expect(() => CreateEventSchema.parse({})).toThrow();
  });

  it("accepts event without optional fields", () => {
    const result = CreateEventSchema.parse({ name: "Minimal" });
    expect(result.name).toBe("Minimal");
    expect(result.description).toBeUndefined();
    expect(result.startsAt).toBeUndefined();
  });
});

describe("UpdateEventSchema", () => {
  it("all fields are optional", () => {
    const result = UpdateEventSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts partial update", () => {
    const result = UpdateEventSchema.parse({ name: "Updated Name" });
    expect(result.name).toBe("Updated Name");
  });

  it("rejects invalid name", () => {
    expect(() => UpdateEventSchema.parse({ name: "" })).toThrow();
  });
});

describe("ListEventsQuerySchema", () => {
  it("defaults page and perPage", () => {
    const result = ListEventsQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(25);
  });

  it("coerces string numbers", () => {
    const result = ListEventsQuerySchema.parse({ page: "2", perPage: "50" });
    expect(result.page).toBe(2);
    expect(result.perPage).toBe(50);
  });

  it("caps perPage at 100", () => {
    expect(() =>
      ListEventsQuerySchema.parse({ perPage: "200" })
    ).toThrow();
  });

  it("accepts valid status filter", () => {
    const result = ListEventsQuerySchema.parse({ status: "archived" });
    expect(result.status).toBe("archived");
  });

  it("rejects invalid status", () => {
    expect(() =>
      ListEventsQuerySchema.parse({ status: "deleted" })
    ).toThrow();
  });
});
