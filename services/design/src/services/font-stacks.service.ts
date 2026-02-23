import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { fontStacks } from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateFontStackSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  primaryFontId: z.string(),
  secondaryFontId: z.string().optional(),
  tertiaryFontId: z.string().optional(),
  details: z.record(z.unknown()).default({}),
  shared: z.boolean().default(true),
});

export const UpdateFontStackSchema = CreateFontStackSchema.partial();

export const ListFontStacksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateFontStackInput = z.infer<typeof CreateFontStackSchema>;
export type UpdateFontStackInput = z.infer<typeof UpdateFontStackSchema>;
export type ListFontStacksQuery = z.infer<typeof ListFontStacksQuerySchema>;

export interface FontStackRecord {
  id: string;
  name: string;
  description: string | null;
  primaryFontId: string;
  secondaryFontId: string | null;
  tertiaryFontId: string | null;
  details: Record<string, unknown>;
  status: string;
  shared: boolean;
  position: number | null;
  lookupKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedFontStacks {
  data: FontStackRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export class FontStacksService {
  constructor(private readonly db: Db) {}

  async list(query: ListFontStacksQuery): Promise<PaginatedFontStacks> {
    const offset = (query.page - 1) * query.perPage;
    const where = eq(fontStacks.status, "active");

    const [rows, countResult] = await Promise.all([
      this.db.select().from(fontStacks).where(where)
        .orderBy(fontStacks.position, fontStacks.name)
        .limit(query.perPage).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(fontStacks).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapStack),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
    };
  }

  async get(id: string): Promise<FontStackRecord> {
    const [row] = await this.db.select().from(fontStacks).where(eq(fontStacks.id, id)).limit(1);
    if (!row) throw new NotFoundError("Font stack not found");
    return mapStack(row);
  }

  async create(input: CreateFontStackInput): Promise<FontStackRecord> {
    const [row] = await this.db.insert(fontStacks).values({
      id: generateId("fst"),
      name: input.name,
      description: input.description ?? null,
      primaryFontId: input.primaryFontId,
      secondaryFontId: input.secondaryFontId ?? null,
      tertiaryFontId: input.tertiaryFontId ?? null,
      details: input.details,
      status: "active",
      shared: input.shared,
    }).returning();
    return mapStack(row!);
  }

  async update(id: string, input: UpdateFontStackInput): Promise<FontStackRecord> {
    await this.get(id);
    const [row] = await this.db.update(fontStacks).set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.primaryFontId !== undefined && { primaryFontId: input.primaryFontId }),
      ...(input.secondaryFontId !== undefined && { secondaryFontId: input.secondaryFontId }),
      ...(input.tertiaryFontId !== undefined && { tertiaryFontId: input.tertiaryFontId }),
      ...(input.details !== undefined && { details: input.details }),
      ...(input.shared !== undefined && { shared: input.shared }),
      updatedAt: new Date(),
    }).where(eq(fontStacks.id, id)).returning();
    return mapStack(row!);
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.db.delete(fontStacks).where(eq(fontStacks.id, id));
  }
}

function mapStack(row: typeof fontStacks.$inferSelect): FontStackRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    primaryFontId: row.primaryFontId,
    secondaryFontId: row.secondaryFontId ?? null,
    tertiaryFontId: row.tertiaryFontId ?? null,
    details: row.details as Record<string, unknown>,
    status: row.status,
    shared: row.shared,
    position: row.position ?? null,
    lookupKey: row.lookupKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
