import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { graphics } from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateGraphicSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  svgBackground: z.string().optional(),
  svgColors: z.array(z.unknown()).default([]),
  details: z.record(z.unknown()).default({}),
  shared: z.boolean().default(false),
});

export const UpdateGraphicSchema = CreateGraphicSchema.partial();

export const ListGraphicsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateGraphicInput = z.infer<typeof CreateGraphicSchema>;
export type UpdateGraphicInput = z.infer<typeof UpdateGraphicSchema>;
export type ListGraphicsQuery = z.infer<typeof ListGraphicsQuerySchema>;

export interface GraphicRecord {
  id: string;
  name: string;
  description: string | null;
  svgBackground: string | null;
  svgChecksum: string | null;
  svgColors: unknown[];
  details: Record<string, unknown>;
  status: string;
  shared: boolean;
  position: number | null;
  lookupKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedGraphics {
  data: GraphicRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export class GraphicsService {
  constructor(private readonly db: Db) {}

  async list(query: ListGraphicsQuery): Promise<PaginatedGraphics> {
    const offset = (query.page - 1) * query.perPage;
    const where = eq(graphics.status, "active");

    const [rows, countResult] = await Promise.all([
      this.db.select().from(graphics).where(where)
        .orderBy(graphics.position, graphics.name)
        .limit(query.perPage).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(graphics).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapGraphic),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
    };
  }

  async get(id: string): Promise<GraphicRecord> {
    const [row] = await this.db.select().from(graphics).where(eq(graphics.id, id)).limit(1);
    if (!row) throw new NotFoundError("Graphic not found");
    return mapGraphic(row);
  }

  async create(input: CreateGraphicInput): Promise<GraphicRecord> {
    const [row] = await this.db.insert(graphics).values({
      id: generateId("gfx"),
      name: input.name,
      description: input.description ?? null,
      svgBackground: input.svgBackground ?? null,
      svgColors: input.svgColors,
      details: input.details,
      status: "active",
      shared: input.shared,
    }).returning();
    return mapGraphic(row!);
  }

  async update(id: string, input: UpdateGraphicInput): Promise<GraphicRecord> {
    await this.get(id);
    const [row] = await this.db.update(graphics).set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.svgBackground !== undefined && { svgBackground: input.svgBackground }),
      ...(input.svgColors !== undefined && { svgColors: input.svgColors }),
      ...(input.details !== undefined && { details: input.details }),
      ...(input.shared !== undefined && { shared: input.shared }),
      updatedAt: new Date(),
    }).where(eq(graphics.id, id)).returning();
    return mapGraphic(row!);
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.db.delete(graphics).where(eq(graphics.id, id));
  }
}

function mapGraphic(row: typeof graphics.$inferSelect): GraphicRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    svgBackground: row.svgBackground ?? null,
    svgChecksum: row.svgChecksum ?? null,
    svgColors: row.svgColors as unknown[],
    details: row.details as Record<string, unknown>,
    status: row.status,
    shared: row.shared,
    position: row.position ?? null,
    lookupKey: row.lookupKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
