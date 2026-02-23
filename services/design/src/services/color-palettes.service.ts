import { eq, and, sql, or, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { colorPalettes } from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateColorPaletteSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  primary: z.string().max(20).optional(),
  secondary: z.string().max(20).optional(),
  tertiary: z.string().max(20).optional(),
  backgroundPrimary: z.string().max(20).optional(),
  backgroundSecondary: z.string().max(20).optional(),
  shared: z.boolean().default(true),
});

export const UpdateColorPaletteSchema = CreateColorPaletteSchema.partial();

export const ListColorPalettesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
  shared: z.enum(["true", "false"]).optional(),
});

export type CreateColorPaletteInput = z.infer<typeof CreateColorPaletteSchema>;
export type UpdateColorPaletteInput = z.infer<typeof UpdateColorPaletteSchema>;
export type ListColorPalettesQuery = z.infer<typeof ListColorPalettesQuerySchema>;

export interface ColorPaletteRecord {
  id: string;
  name: string;
  description: string | null;
  primary: string | null;
  secondary: string | null;
  tertiary: string | null;
  backgroundPrimary: string | null;
  backgroundSecondary: string | null;
  status: string;
  shared: boolean;
  position: number | null;
  lookupKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedColorPalettes {
  data: ColorPaletteRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export class ColorPalettesService {
  constructor(private readonly db: Db) {}

  async list(query: ListColorPalettesQuery): Promise<PaginatedColorPalettes> {
    const offset = (query.page - 1) * query.perPage;

    const conditions = [eq(colorPalettes.status, "active")];
    if (query.shared === "true") conditions.push(eq(colorPalettes.shared, true));
    if (query.shared === "false") conditions.push(eq(colorPalettes.shared, false));
    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(colorPalettes).where(where)
        .orderBy(colorPalettes.position, colorPalettes.name)
        .limit(query.perPage).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(colorPalettes).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapPalette),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
    };
  }

  async get(id: string): Promise<ColorPaletteRecord> {
    const [row] = await this.db.select().from(colorPalettes).where(eq(colorPalettes.id, id)).limit(1);
    if (!row) throw new NotFoundError("Color palette not found");
    return mapPalette(row);
  }

  async create(input: CreateColorPaletteInput): Promise<ColorPaletteRecord> {
    const [row] = await this.db.insert(colorPalettes).values({
      id: generateId("pal"),
      name: input.name,
      description: input.description ?? null,
      primary: input.primary ?? null,
      secondary: input.secondary ?? null,
      tertiary: input.tertiary ?? null,
      backgroundPrimary: input.backgroundPrimary ?? null,
      backgroundSecondary: input.backgroundSecondary ?? null,
      status: "active",
      shared: input.shared,
    }).returning();
    return mapPalette(row!);
  }

  async update(id: string, input: UpdateColorPaletteInput): Promise<ColorPaletteRecord> {
    await this.get(id);
    const [row] = await this.db.update(colorPalettes).set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.primary !== undefined && { primary: input.primary }),
      ...(input.secondary !== undefined && { secondary: input.secondary }),
      ...(input.tertiary !== undefined && { tertiary: input.tertiary }),
      ...(input.backgroundPrimary !== undefined && { backgroundPrimary: input.backgroundPrimary }),
      ...(input.backgroundSecondary !== undefined && { backgroundSecondary: input.backgroundSecondary }),
      ...(input.shared !== undefined && { shared: input.shared }),
      updatedAt: new Date(),
    }).where(eq(colorPalettes.id, id)).returning();
    return mapPalette(row!);
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.db.delete(colorPalettes).where(eq(colorPalettes.id, id));
  }
}

function mapPalette(row: typeof colorPalettes.$inferSelect): ColorPaletteRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    primary: row.primary ?? null,
    secondary: row.secondary ?? null,
    tertiary: row.tertiary ?? null,
    backgroundPrimary: row.backgroundPrimary ?? null,
    backgroundSecondary: row.backgroundSecondary ?? null,
    status: row.status,
    shared: row.shared,
    position: row.position ?? null,
    lookupKey: row.lookupKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
