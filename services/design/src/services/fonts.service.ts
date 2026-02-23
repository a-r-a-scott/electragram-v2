import { eq, and, sql, or, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { fonts } from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateFontSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  kind: z.enum(["system", "google", "custom"]).default("system"),
  externalKey: z.string().max(255).optional(),
  details: z.record(z.unknown()).default({}),
  shared: z.boolean().default(true),
});

export const UpdateFontSchema = CreateFontSchema.partial();

export const ListFontsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(50),
  kind: z.enum(["system", "google", "custom"]).optional(),
  accountId: z.string().optional(),
});

export type CreateFontInput = z.infer<typeof CreateFontSchema>;
export type UpdateFontInput = z.infer<typeof UpdateFontSchema>;
export type ListFontsQuery = z.infer<typeof ListFontsQuerySchema>;

export interface FontRecord {
  id: string;
  accountId: string | null;
  name: string;
  description: string | null;
  kind: string;
  externalKey: string | null;
  details: Record<string, unknown>;
  status: string;
  shared: boolean;
  lookupKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedFonts {
  data: FontRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export class FontsService {
  constructor(private readonly db: Db) {}

  async list(accountId: string, query: ListFontsQuery): Promise<PaginatedFonts> {
    const offset = (query.page - 1) * query.perPage;
    // Return shared fonts + account-specific fonts
    const conditions = [
      eq(fonts.status, "active"),
      or(eq(fonts.shared, true), eq(fonts.accountId, accountId))!,
    ];
    if (query.kind) conditions.push(eq(fonts.kind, query.kind));
    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(fonts).where(where)
        .orderBy(fonts.name).limit(query.perPage).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(fonts).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapFont),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
    };
  }

  async get(id: string): Promise<FontRecord> {
    const [row] = await this.db.select().from(fonts).where(eq(fonts.id, id)).limit(1);
    if (!row) throw new NotFoundError("Font not found");
    return mapFont(row);
  }

  async create(accountId: string, input: CreateFontInput): Promise<FontRecord> {
    const [row] = await this.db.insert(fonts).values({
      id: generateId("fnt"),
      accountId: input.shared ? null : accountId,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      externalKey: input.externalKey ?? null,
      details: input.details,
      status: "active",
      shared: input.shared,
    }).returning();
    return mapFont(row!);
  }

  async update(id: string, input: UpdateFontInput): Promise<FontRecord> {
    await this.get(id);
    const [row] = await this.db.update(fonts).set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.externalKey !== undefined && { externalKey: input.externalKey }),
      ...(input.details !== undefined && { details: input.details }),
      ...(input.shared !== undefined && { shared: input.shared }),
      updatedAt: new Date(),
    }).where(eq(fonts.id, id)).returning();
    return mapFont(row!);
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.db.delete(fonts).where(eq(fonts.id, id));
  }
}

function mapFont(row: typeof fonts.$inferSelect): FontRecord {
  return {
    id: row.id,
    accountId: row.accountId ?? null,
    name: row.name,
    description: row.description ?? null,
    kind: row.kind,
    externalKey: row.externalKey ?? null,
    details: row.details as Record<string, unknown>,
    status: row.status,
    shared: row.shared,
    lookupKey: row.lookupKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
