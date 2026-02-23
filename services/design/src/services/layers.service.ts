import { eq, and, sql, asc } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { themeLayers } from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateLayerSchema = z.object({
  name: z.string().max(255).optional(),
  kind: z.enum(["background", "foreground", "overlay", "text", "graphic", "border"]).default("background"),
  side: z.enum(["front", "back"]).default("front"),
  position: z.number().int().default(0),
  svgBackground: z.string().optional(),
  svgColors: z.array(z.unknown()).default([]),
  dimensions: z.tuple([z.number(), z.number()]).optional(),
  coordinates: z.tuple([z.number(), z.number()]).optional(),
  details: z.record(z.unknown()).default({}),
});

export const UpdateLayerSchema = CreateLayerSchema.partial();

export type CreateLayerInput = z.infer<typeof CreateLayerSchema>;
export type UpdateLayerInput = z.infer<typeof UpdateLayerSchema>;

export interface LayerRecord {
  id: string;
  themeTemplateId: string;
  name: string | null;
  kind: string;
  side: string;
  position: number | null;
  svgBackground: string | null;
  svgChecksum: string | null;
  svgColors: unknown[];
  dimensions: [number, number] | null;
  coordinates: [number, number] | null;
  details: Record<string, unknown>;
  lookupKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export class LayersService {
  constructor(private readonly db: Db) {}

  async list(themeTemplateId: string): Promise<LayerRecord[]> {
    const rows = await this.db.select().from(themeLayers)
      .where(eq(themeLayers.themeTemplateId, themeTemplateId))
      .orderBy(asc(themeLayers.position));
    return rows.map(mapLayer);
  }

  async get(themeTemplateId: string, layerId: string): Promise<LayerRecord> {
    const [row] = await this.db.select().from(themeLayers)
      .where(and(eq(themeLayers.id, layerId), eq(themeLayers.themeTemplateId, themeTemplateId)))
      .limit(1);
    if (!row) throw new NotFoundError("Layer not found");
    return mapLayer(row);
  }

  async create(themeTemplateId: string, input: CreateLayerInput): Promise<LayerRecord> {
    const [row] = await this.db.insert(themeLayers).values({
      id: generateId("lyr"),
      themeTemplateId,
      name: input.name ?? null,
      kind: input.kind,
      side: input.side,
      position: input.position,
      svgBackground: input.svgBackground ?? null,
      svgColors: input.svgColors,
      dimensions: input.dimensions ?? null,
      coordinates: input.coordinates ?? null,
      details: input.details,
    }).returning();
    return mapLayer(row!);
  }

  async update(themeTemplateId: string, layerId: string, input: UpdateLayerInput): Promise<LayerRecord> {
    await this.get(themeTemplateId, layerId);
    const [row] = await this.db.update(themeLayers).set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.side !== undefined && { side: input.side }),
      ...(input.position !== undefined && { position: input.position }),
      ...(input.svgBackground !== undefined && { svgBackground: input.svgBackground }),
      ...(input.svgColors !== undefined && { svgColors: input.svgColors }),
      ...(input.dimensions !== undefined && { dimensions: input.dimensions }),
      ...(input.coordinates !== undefined && { coordinates: input.coordinates }),
      ...(input.details !== undefined && { details: input.details }),
      updatedAt: new Date(),
    }).where(eq(themeLayers.id, layerId)).returning();
    return mapLayer(row!);
  }

  async delete(themeTemplateId: string, layerId: string): Promise<void> {
    await this.get(themeTemplateId, layerId);
    await this.db.delete(themeLayers).where(eq(themeLayers.id, layerId));
  }
}

function mapLayer(row: typeof themeLayers.$inferSelect): LayerRecord {
  return {
    id: row.id,
    themeTemplateId: row.themeTemplateId,
    name: row.name ?? null,
    kind: row.kind,
    side: row.side,
    position: row.position ?? null,
    svgBackground: row.svgBackground ?? null,
    svgChecksum: row.svgChecksum ?? null,
    svgColors: row.svgColors as unknown[],
    dimensions: row.dimensions as [number, number] | null,
    coordinates: row.coordinates as [number, number] | null,
    details: row.details as Record<string, unknown>,
    lookupKey: row.lookupKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
