import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

import type { Event, PaginatedResponse } from "@electragram/types";

import type { Db } from "../db/client.js";
import { events } from "../db/schema.js";
import { generateId, buildSearchText } from "../utils/id.js";
import { NotFoundError, ValidationError } from "./errors.js";

export const CreateEventSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  capacityMax: z.number().int().positive().optional(),
  isOpen: z.boolean().optional().default(true),
});

export const UpdateEventSchema = CreateEventSchema.partial();

export const ListEventsQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;
export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;

export class EventsService {
  constructor(private readonly db: Db) {}

  async listEvents(
    accountId: string,
    query: ListEventsQuery
  ): Promise<PaginatedResponse<Event>> {
    const offset = (query.page - 1) * query.perPage;

    const conditions = [eq(events.accountId, accountId)];
    if (query.status) conditions.push(eq(events.status, query.status));

    const whereClause = query.q
      ? and(
          ...conditions,
          sql`${events.searchText} @@ plainto_tsquery('english', ${query.q})`
        )
      : and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(events)
        .where(whereClause)
        .orderBy(events.createdAt)
        .limit(query.perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(events)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapEvent),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async getEvent(accountId: string, eventId: string): Promise<Event> {
    const [row] = await this.db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.accountId, accountId)))
      .limit(1);

    if (!row) throw new NotFoundError("Event not found");
    return mapEvent(row);
  }

  async createEvent(accountId: string, input: CreateEventInput): Promise<Event> {
    if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
      throw new ValidationError("ends_at must be after starts_at");
    }

    const id = generateId("evt");
    const searchText = buildSearchText(input.name, input.description);

    const [event] = await this.db
      .insert(events)
      .values({
        id,
        accountId,
        name: input.name,
        description: input.description ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        status: "active",
        isOpen: input.isOpen ?? true,
        capacityMax: input.capacityMax ?? null,
        searchText: sql`to_tsvector('english', ${searchText})`,
      })
      .returning();

    if (!event) throw new Error("Failed to create event");
    return mapEvent(event);
  }

  async updateEvent(
    accountId: string,
    eventId: string,
    input: UpdateEventInput
  ): Promise<Event> {
    await this.requireEvent(accountId, eventId);

    if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
      throw new ValidationError("ends_at must be after starts_at");
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.startsAt !== undefined) updates.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) updates.endsAt = new Date(input.endsAt);
    if (input.capacityMax !== undefined) updates.capacityMax = input.capacityMax;
    if (input.isOpen !== undefined) updates.isOpen = input.isOpen;

    if (input.name !== undefined || input.description !== undefined) {
      const [current] = await this.db
        .select({ name: events.name, description: events.description })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);
      const name = (input.name ?? current?.name ?? "") as string;
      const desc = (input.description ?? current?.description) as string | undefined;
      updates.searchText = sql`to_tsvector('english', ${buildSearchText(name, desc)})`;
    }

    const [updated] = await this.db
      .update(events)
      .set(updates)
      .where(eq(events.id, eventId))
      .returning();

    if (!updated) throw new NotFoundError("Event not found");
    return mapEvent(updated);
  }

  async archiveEvent(accountId: string, eventId: string): Promise<void> {
    const result = await this.db
      .update(events)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(events.id, eventId), eq(events.accountId, accountId)));

    if (result.rowCount === 0) throw new NotFoundError("Event not found");
  }

  async requireEvent(accountId: string, eventId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.accountId, accountId)))
      .limit(1);
    if (!row) throw new NotFoundError("Event not found");
  }
}

function mapEvent(row: typeof events.$inferSelect): Event {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    description: row.description ?? null,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    status: row.status,
    guestsCount: row.guestsCount,
    listsCount: row.listsCount,
    capacityMax: row.capacityMax ?? null,
    capacityCount: row.capacityCount,
    isOpen: row.isOpen,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
