import { eq, and, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { themes } from "../db/schema.js";
import { generateId, buildSearchText } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateThemeSchema = z.object({
  name: z.string().min(1).max(255),
  title: z.string().max(255).optional(),
  description: z.string().optional(),
  kind: z.enum(["invitation", "email", "event_page", "general"]).default("invitation"),
  colorPaletteId: z.string().optional(),
  fontStackId: z.string().optional(),
  details: z.record(z.unknown()).default({}),
  dimensions: z.tuple([z.number(), z.number()]).default([1400, 1400]),
  shared: z.boolean().default(false),
});

export const UpdateThemeSchema = CreateThemeSchema.partial();

export const ListThemesQuerySchema = z.object({
  q: z.string().optional(),
  kind: z.enum(["invitation", "email", "event_page", "general"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  shared: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateThemeInput = z.infer<typeof CreateThemeSchema>;
export type UpdateThemeInput = z.infer<typeof UpdateThemeSchema>;
export type ListThemesQuery = z.infer<typeof ListThemesQuerySchema>;

export interface ThemeRecord {
  id: string;
  accountId: string | null;
  name: string;
  title: string | null;
  description: string | null;
  kind: string;
  status: string;
  shared: boolean;
  customized: boolean;
  locked: boolean;
  colorPaletteId: string | null;
  fontStackId: string | null;
  details: Record<string, unknown>;
  dimensions: [number, number];
  position: number | null;
  lookupKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedThemes {
  data: ThemeRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export class ThemesService {
  constructor(private readonly db: Db) {}

  async list(accountId: string, query: ListThemesQuery): Promise<PaginatedThemes> {
    const offset = (query.page - 1) * query.perPage;

    // Return shared themes + account-owned themes
    const conditions: ReturnType<typeof eq>[] = [
      or(eq(themes.shared, true), eq(themes.accountId, accountId))! as any,
    ];
    if (query.kind) conditions.push(eq(themes.kind, query.kind) as any);
    if (query.status) conditions.push(eq(themes.status, query.status) as any);
    if (query.shared === "true") conditions.push(eq(themes.shared, true) as any);
    if (query.shared === "false") conditions.push(eq(themes.shared, false) as any);

    const whereClause = query.q
      ? and(
          ...conditions,
          sql`${themes.searchText} @@ plainto_tsquery('english', ${query.q})`
        )
      : and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(themes).where(whereClause)
        .orderBy(themes.position, themes.name)
        .limit(query.perPage).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(themes).where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapTheme),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
    };
  }

  async get(id: string): Promise<ThemeRecord> {
    const [row] = await this.db.select().from(themes).where(eq(themes.id, id)).limit(1);
    if (!row) throw new NotFoundError("Theme not found");
    return mapTheme(row);
  }

  async create(accountId: string, input: CreateThemeInput): Promise<ThemeRecord> {
    const searchText = buildSearchText(input.name, input.description);
    const [row] = await this.db.insert(themes).values({
      id: generateId("thm"),
      accountId: input.shared ? null : accountId,
      name: input.name,
      title: input.title ?? null,
      description: input.description ?? null,
      kind: input.kind,
      status: "draft",
      shared: input.shared,
      colorPaletteId: input.colorPaletteId ?? null,
      fontStackId: input.fontStackId ?? null,
      details: input.details,
      dimensions: input.dimensions,
      searchText: sql`to_tsvector('english', ${searchText})`,
    }).returning();
    return mapTheme(row!);
  }

  async update(id: string, input: UpdateThemeInput): Promise<ThemeRecord> {
    const existing = await this.get(id);
    const name = input.name ?? existing.name;
    const description = input.description !== undefined ? input.description : existing.description;
    const searchText = buildSearchText(name, description);

    const [row] = await this.db.update(themes).set({
      ...(input.name !== undefined && { name }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.colorPaletteId !== undefined && { colorPaletteId: input.colorPaletteId }),
      ...(input.fontStackId !== undefined && { fontStackId: input.fontStackId }),
      ...(input.details !== undefined && { details: input.details }),
      ...(input.dimensions !== undefined && { dimensions: input.dimensions }),
      ...(input.shared !== undefined && { shared: input.shared }),
      searchText: sql`to_tsvector('english', ${searchText})`,
      updatedAt: new Date(),
    }).where(eq(themes.id, id)).returning();
    return mapTheme(row!);
  }

  async publish(id: string): Promise<ThemeRecord> {
    await this.get(id);
    const [row] = await this.db.update(themes)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(themes.id, id)).returning();
    return mapTheme(row!);
  }

  async archive(id: string): Promise<void> {
    await this.get(id);
    await this.db.update(themes).set({ status: "archived", updatedAt: new Date() }).where(eq(themes.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.db.delete(themes).where(eq(themes.id, id));
  }
}

function mapTheme(row: typeof themes.$inferSelect): ThemeRecord {
  return {
    id: row.id,
    accountId: row.accountId ?? null,
    name: row.name,
    title: row.title ?? null,
    description: row.description ?? null,
    kind: row.kind,
    status: row.status,
    shared: row.shared,
    customized: row.customized,
    locked: row.locked,
    colorPaletteId: row.colorPaletteId ?? null,
    fontStackId: row.fontStackId ?? null,
    details: row.details as Record<string, unknown>,
    dimensions: row.dimensions as [number, number],
    position: row.position ?? null,
    lookupKey: row.lookupKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
