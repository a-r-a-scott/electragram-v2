import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";

import type { PaginatedResponse } from "@electragram/types";

import type { Db } from "../db/client.js";
import {
  guests,
  eventGuests,
  eventGuestProfiles,
  events,
} from "../db/schema.js";
import {
  generateId,
  hashEmail,
  buildGuestDupeKey,
  buildSearchText,
} from "../utils/id.js";
import { NotFoundError, ConflictError } from "./errors.js";

export const CreateGuestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  whatsapp: z.string().max(50).optional(),
  preferredChannel: z.enum(["email", "sms", "whatsapp"]).optional(),
  emailOptin: z.boolean().optional().default(true),
  customFields: z.record(z.unknown()).optional().default({}),
});

export const UpdateGuestSchema = CreateGuestSchema.partial();

export const AddGuestToEventSchema = z.object({
  guestId: z.string(),
  status: z
    .enum(["pending", "invited", "accepted", "declined", "registered"])
    .optional()
    .default("pending"),
  attendeesCount: z.number().int().positive().optional().default(1),
});

export const BulkAddGuestsSchema = z.object({
  guestIds: z.array(z.string()).min(1).max(500),
  status: z
    .enum(["pending", "invited", "accepted", "declined", "registered"])
    .optional()
    .default("pending"),
});

export const CheckInGuestSchema = z.object({
  seatNumber: z.string().optional(),
  tableNumber: z.string().optional(),
});

export const UpdateGuestStatusSchema = z.object({
  status: z.enum([
    "pending",
    "invited",
    "accepted",
    "declined",
    "archived",
    "registered",
    "unsubscribed",
  ]),
  attendanceStatus: z.enum(["attending", "not_attending", "maybe"]).optional(),
});

export const ListGuestsQuerySchema = z.object({
  q: z.string().optional(),
  status: z
    .enum([
      "pending",
      "invited",
      "accepted",
      "declined",
      "archived",
      "registered",
      "unsubscribed",
    ])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateGuestInput = z.infer<typeof CreateGuestSchema>;
export type UpdateGuestInput = z.infer<typeof UpdateGuestSchema>;
export type AddGuestToEventInput = z.infer<typeof AddGuestToEventSchema>;
export type BulkAddGuestsInput = z.infer<typeof BulkAddGuestsSchema>;
export type CheckInGuestInput = z.infer<typeof CheckInGuestSchema>;
export type UpdateGuestStatusInput = z.infer<typeof UpdateGuestStatusSchema>;
export type ListGuestsQuery = z.infer<typeof ListGuestsQuerySchema>;

export interface GuestRecord {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredChannel: string | null;
  emailOptin: boolean;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EventGuestRecord {
  id: string;
  eventId: string;
  guestId: string;
  accountId: string;
  status: string;
  hasResponded: boolean;
  attendanceStatus: string | null;
  checkedInAt: string | null;
  seatNumber: string | null;
  tableNumber: string | null;
  attendeesCount: number;
  guest: GuestRecord;
  createdAt: string;
  updatedAt: string;
}

export class GuestsService {
  constructor(private readonly db: Db) {}

  // ── Account-level guest registry ──────────────────────────────────────────

  async listGuests(
    accountId: string,
    query: ListGuestsQuery
  ): Promise<PaginatedResponse<GuestRecord>> {
    const offset = (query.page - 1) * query.perPage;

    const conditions = [eq(guests.accountId, accountId)];
    const whereClause = query.q
      ? and(
          ...conditions,
          sql`${guests.searchText} @@ plainto_tsquery('english', ${query.q})`
        )
      : and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(guests)
        .where(whereClause)
        .orderBy(guests.createdAt)
        .limit(query.perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(guests)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapGuest),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async getGuest(accountId: string, guestId: string): Promise<GuestRecord> {
    const [row] = await this.db
      .select()
      .from(guests)
      .where(and(eq(guests.id, guestId), eq(guests.accountId, accountId)))
      .limit(1);
    if (!row) throw new NotFoundError("Guest not found");
    return mapGuest(row);
  }

  async createGuest(
    accountId: string,
    input: CreateGuestInput
  ): Promise<GuestRecord> {
    const emailHash = input.email ? hashEmail(input.email) : null;
    const dupeKey = buildGuestDupeKey(input.firstName, input.lastName, input.email);

    if (emailHash) {
      const [existing] = await this.db
        .select({ id: guests.id })
        .from(guests)
        .where(and(eq(guests.accountId, accountId), eq(guests.emailHash, emailHash)))
        .limit(1);
      if (existing) throw new ConflictError("A guest with this email already exists");
    }

    const id = generateId("gst");
    const searchText = buildSearchText(
      input.firstName,
      input.lastName,
      input.email
    );

    const [guest] = await this.db
      .insert(guests)
      .values({
        id,
        accountId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        preferredChannel: input.preferredChannel ?? "email",
        emailOptin: input.emailOptin ?? true,
        customFields: input.customFields ?? {},
        emailHash,
        dupeKey,
        searchText: sql`to_tsvector('english', ${searchText})`,
      })
      .returning();

    if (!guest) throw new Error("Failed to create guest");
    return mapGuest(guest);
  }

  async updateGuest(
    accountId: string,
    guestId: string,
    input: UpdateGuestInput
  ): Promise<GuestRecord> {
    const [existing] = await this.db
      .select()
      .from(guests)
      .where(and(eq(guests.id, guestId), eq(guests.accountId, accountId)))
      .limit(1);
    if (!existing) throw new NotFoundError("Guest not found");

    const newEmail = input.email ?? existing.email;
    const newEmailHash = newEmail ? hashEmail(newEmail) : null;

    if (newEmailHash && newEmailHash !== existing.emailHash) {
      const [conflict] = await this.db
        .select({ id: guests.id })
        .from(guests)
        .where(
          and(
            eq(guests.accountId, accountId),
            eq(guests.emailHash, newEmailHash),
            sql`${guests.id} != ${guestId}`
          )
        )
        .limit(1);
      if (conflict) throw new ConflictError("A guest with this email already exists");
    }

    const firstName = input.firstName ?? existing.firstName;
    const lastName = input.lastName ?? existing.lastName;
    const searchText = buildSearchText(firstName, lastName, newEmail);

    const [updated] = await this.db
      .update(guests)
      .set({
        firstName,
        lastName,
        email: newEmail,
        phone: input.phone !== undefined ? input.phone : existing.phone,
        whatsapp: input.whatsapp !== undefined ? input.whatsapp : existing.whatsapp,
        preferredChannel:
          input.preferredChannel !== undefined
            ? input.preferredChannel
            : existing.preferredChannel,
        emailOptin: input.emailOptin !== undefined ? input.emailOptin : existing.emailOptin,
        customFields:
          input.customFields !== undefined
            ? input.customFields
            : (existing.customFields as Record<string, unknown>),
        emailHash: newEmailHash,
        dupeKey: buildGuestDupeKey(firstName, lastName, newEmail),
        searchText: sql`to_tsvector('english', ${searchText})`,
        updatedAt: new Date(),
      })
      .where(eq(guests.id, guestId))
      .returning();

    if (!updated) throw new NotFoundError("Guest not found");
    return mapGuest(updated);
  }

  // ── Event-level guest operations ──────────────────────────────────────────

  async listEventGuests(
    accountId: string,
    eventId: string,
    query: ListGuestsQuery
  ): Promise<PaginatedResponse<EventGuestRecord>> {
    const offset = (query.page - 1) * query.perPage;

    const conditions = [
      eq(eventGuests.eventId, eventId),
      eq(eventGuests.accountId, accountId),
    ];
    if (query.status) conditions.push(eq(eventGuests.status, query.status as any));

    const whereClause = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(eventGuests)
        .innerJoin(guests, eq(eventGuests.guestId, guests.id))
        .where(whereClause)
        .orderBy(eventGuests.createdAt)
        .limit(query.perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(eventGuests)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => mapEventGuest(r.event_guests, r.guests)),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async addGuestToEvent(
    accountId: string,
    eventId: string,
    input: AddGuestToEventInput
  ): Promise<EventGuestRecord> {
    const [guest] = await this.db
      .select({ id: guests.id })
      .from(guests)
      .where(and(eq(guests.id, input.guestId), eq(guests.accountId, accountId)))
      .limit(1);
    if (!guest) throw new NotFoundError("Guest not found");

    const [existing] = await this.db
      .select({ id: eventGuests.id })
      .from(eventGuests)
      .where(and(eq(eventGuests.eventId, eventId), eq(eventGuests.guestId, input.guestId)))
      .limit(1);
    if (existing) throw new ConflictError("Guest already added to event");

    const id = generateId("eg");
    const [row] = await this.db
      .insert(eventGuests)
      .values({
        id,
        eventId,
        guestId: input.guestId,
        accountId,
        status: input.status ?? "pending",
        attendeesCount: input.attendeesCount ?? 1,
      })
      .returning();

    await this.db
      .update(events)
      .set({
        guestsCount: sql`${events.guestsCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));

    const [guestRow] = await this.db
      .select()
      .from(guests)
      .where(eq(guests.id, input.guestId))
      .limit(1);

    return mapEventGuest(row!, guestRow!);
  }

  async bulkAddGuests(
    accountId: string,
    eventId: string,
    input: BulkAddGuestsInput
  ): Promise<{ added: number; skipped: number }> {
    const validGuests = await this.db
      .select({ id: guests.id })
      .from(guests)
      .where(and(eq(guests.accountId, accountId), inArray(guests.id, input.guestIds)));

    const existing = await this.db
      .select({ guestId: eventGuests.guestId })
      .from(eventGuests)
      .where(
        and(
          eq(eventGuests.eventId, eventId),
          inArray(eventGuests.guestId, input.guestIds)
        )
      );

    const existingSet = new Set(existing.map((e) => e.guestId));
    const toAdd = validGuests.filter((g) => !existingSet.has(g.id));

    if (toAdd.length === 0) {
      return { added: 0, skipped: input.guestIds.length };
    }

    const values = toAdd.map((g) => ({
      id: generateId("eg"),
      eventId,
      guestId: g.id,
      accountId,
      status: input.status ?? "pending",
    }));

    await this.db.insert(eventGuests).values(values as any[]);
    await this.db
      .update(events)
      .set({
        guestsCount: sql`${events.guestsCount} + ${toAdd.length}`,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));

    return {
      added: toAdd.length,
      skipped: input.guestIds.length - toAdd.length,
    };
  }

  async removeGuestFromEvent(
    accountId: string,
    eventId: string,
    eventGuestId: string
  ): Promise<void> {
    const [row] = await this.db
      .select({ id: eventGuests.id })
      .from(eventGuests)
      .where(
        and(
          eq(eventGuests.id, eventGuestId),
          eq(eventGuests.eventId, eventId),
          eq(eventGuests.accountId, accountId)
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError("Event guest not found");

    await this.db.delete(eventGuests).where(eq(eventGuests.id, eventGuestId));
    await this.db
      .update(events)
      .set({
        guestsCount: sql`GREATEST(${events.guestsCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));
  }

  async updateGuestStatus(
    accountId: string,
    eventId: string,
    eventGuestId: string,
    input: UpdateGuestStatusInput
  ): Promise<EventGuestRecord> {
    const [existing] = await this.db
      .select()
      .from(eventGuests)
      .where(
        and(
          eq(eventGuests.id, eventGuestId),
          eq(eventGuests.eventId, eventId),
          eq(eventGuests.accountId, accountId)
        )
      )
      .limit(1);
    if (!existing) throw new NotFoundError("Event guest not found");

    const [updated] = await this.db
      .update(eventGuests)
      .set({
        status: input.status,
        attendanceStatus: input.attendanceStatus ?? null,
        hasResponded: ["accepted", "declined"].includes(input.status),
        updatedAt: new Date(),
      })
      .where(eq(eventGuests.id, eventGuestId))
      .returning();

    const [guestRow] = await this.db
      .select()
      .from(guests)
      .where(eq(guests.id, updated!.guestId))
      .limit(1);

    return mapEventGuest(updated!, guestRow!);
  }

  async checkIn(
    accountId: string,
    eventId: string,
    eventGuestId: string,
    input: CheckInGuestInput
  ): Promise<EventGuestRecord> {
    const [existing] = await this.db
      .select()
      .from(eventGuests)
      .where(
        and(
          eq(eventGuests.id, eventGuestId),
          eq(eventGuests.eventId, eventId),
          eq(eventGuests.accountId, accountId)
        )
      )
      .limit(1);
    if (!existing) throw new NotFoundError("Event guest not found");

    const [updated] = await this.db
      .update(eventGuests)
      .set({
        checkedInAt: new Date(),
        seatNumber: input.seatNumber ?? existing.seatNumber,
        tableNumber: input.tableNumber ?? existing.tableNumber,
        status: "registered",
        updatedAt: new Date(),
      })
      .where(eq(eventGuests.id, eventGuestId))
      .returning();

    await this.db
      .update(events)
      .set({
        capacityCount: sql`${events.capacityCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));

    const [guestRow] = await this.db
      .select()
      .from(guests)
      .where(eq(guests.id, updated!.guestId))
      .limit(1);

    return mapEventGuest(updated!, guestRow!);
  }
}

function mapGuest(row: typeof guests.$inferSelect): GuestRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email ?? null,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    preferredChannel: row.preferredChannel ?? null,
    emailOptin: row.emailOptin,
    customFields: row.customFields as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEventGuest(
  row: typeof eventGuests.$inferSelect,
  guestRow: typeof guests.$inferSelect
): EventGuestRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    guestId: row.guestId,
    accountId: row.accountId,
    status: row.status,
    hasResponded: row.hasResponded,
    attendanceStatus: row.attendanceStatus ?? null,
    checkedInAt: row.checkedInAt?.toISOString() ?? null,
    seatNumber: row.seatNumber ?? null,
    tableNumber: row.tableNumber ?? null,
    attendeesCount: row.attendeesCount,
    guest: mapGuest(guestRow),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
