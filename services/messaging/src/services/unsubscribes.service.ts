import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "../db/client.js";
import { unsubscribes } from "../db/schema.js";
import { generateId } from "../utils/id.js";

export const CreateUnsubscribeSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  guestId: z.string().optional(),
  messageId: z.string().optional(),
  reason: z.string().max(255).optional(),
  isGlobal: z.boolean().optional().default(false),
}).refine((d) => d.email ?? d.phone ?? d.guestId, {
  message: "At least one of email, phone, or guestId is required",
});

export const ListUnsubscribesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateUnsubscribeInput = z.infer<typeof CreateUnsubscribeSchema>;
export type ListUnsubscribesQuery = z.infer<typeof ListUnsubscribesQuerySchema>;

export interface UnsubscribeRecord {
  id: string;
  accountId: string;
  email: string | null;
  phone: string | null;
  guestId: string | null;
  messageId: string | null;
  reason: string | null;
  isGlobal: boolean;
  createdAt: string;
}

export interface PaginatedUnsubscribes {
  data: UnsubscribeRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export class UnsubscribesService {
  constructor(private readonly db: Db) {}

  async listUnsubscribes(
    accountId: string,
    query: ListUnsubscribesQuery
  ): Promise<PaginatedUnsubscribes> {
    const offset = (query.page - 1) * query.perPage;
    const whereClause = eq(unsubscribes.accountId, accountId);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(unsubscribes)
        .where(whereClause)
        .orderBy(unsubscribes.createdAt)
        .limit(query.perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(unsubscribes)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapUnsubscribe),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
    };
  }

  async isUnsubscribed(
    accountId: string,
    email?: string,
    phone?: string
  ): Promise<boolean> {
    if (!email && !phone) return false;

    const conditions = [eq(unsubscribes.accountId, accountId)];
    if (email) conditions.push(eq(unsubscribes.email, email));

    const [row] = await this.db
      .select({ id: unsubscribes.id })
      .from(unsubscribes)
      .where(and(...conditions))
      .limit(1);

    return !!row;
  }

  async createUnsubscribe(
    accountId: string,
    input: CreateUnsubscribeInput
  ): Promise<UnsubscribeRecord> {
    const id = generateId("uns");
    const [row] = await this.db
      .insert(unsubscribes)
      .values({
        id,
        accountId,
        email: input.email ?? null,
        phone: input.phone ?? null,
        guestId: input.guestId ?? null,
        messageId: input.messageId ?? null,
        reason: input.reason ?? null,
        isGlobal: input.isGlobal ?? false,
      })
      .returning();

    return mapUnsubscribe(row!);
  }

  async deleteUnsubscribe(accountId: string, unsubscribeId: string): Promise<void> {
    await this.db
      .delete(unsubscribes)
      .where(
        and(
          eq(unsubscribes.id, unsubscribeId),
          eq(unsubscribes.accountId, accountId)
        )
      );
  }
}

function mapUnsubscribe(row: typeof unsubscribes.$inferSelect): UnsubscribeRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    email: row.email ?? null,
    phone: row.phone ?? null,
    guestId: row.guestId ?? null,
    messageId: row.messageId ?? null,
    reason: row.reason ?? null,
    isGlobal: row.isGlobal,
    createdAt: row.createdAt.toISOString(),
  };
}
