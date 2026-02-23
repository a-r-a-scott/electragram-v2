import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { blocks } from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateBlockSchema = z.object({
  blockableType: z.string().min(1).max(100),
  blockableId: z.string().min(1).max(26),
  parentId: z.string().max(26).optional(),
  kind: z.enum(["section", "row", "column", "text", "image", "button", "divider", "spacer", "form_field"]).default("section"),
  name: z.string().max(255).optional(),
  style: z.string().max(255).default("default"),
  position: z.number().int().default(0),
  visible: z.boolean().default(true),
  details: z.record(z.unknown()).default({}),
  fieldType: z.string().max(50).optional(),
  required: z.boolean().default(false),
  placeholder: z.string().max(255).default(""),
});

export const UpdateBlockSchema = CreateBlockSchema.omit({ blockableType: true, blockableId: true }).partial();

export const ListBlocksQuerySchema = z.object({
  blockableType: z.string(),
  blockableId: z.string(),
});

export type CreateBlockInput = z.infer<typeof CreateBlockSchema>;
export type UpdateBlockInput = z.infer<typeof UpdateBlockSchema>;
export type ListBlocksQuery = z.infer<typeof ListBlocksQuerySchema>;

export interface BlockRecord {
  id: string;
  blockableType: string;
  blockableId: string;
  parentId: string | null;
  kind: string;
  name: string | null;
  style: string;
  position: number;
  visible: boolean;
  details: Record<string, unknown>;
  fieldType: string | null;
  required: boolean;
  placeholder: string | null;
  lookupKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export class BlocksService {
  constructor(private readonly db: Db) {}

  async list(blockableType: string, blockableId: string): Promise<BlockRecord[]> {
    const rows = await this.db.select().from(blocks)
      .where(and(eq(blocks.blockableType, blockableType), eq(blocks.blockableId, blockableId)))
      .orderBy(asc(blocks.position));
    return rows.map(mapBlock);
  }

  async get(id: string): Promise<BlockRecord> {
    const [row] = await this.db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
    if (!row) throw new NotFoundError("Block not found");
    return mapBlock(row);
  }

  async create(input: CreateBlockInput): Promise<BlockRecord> {
    const [row] = await this.db.insert(blocks).values({
      id: generateId("blk"),
      blockableType: input.blockableType,
      blockableId: input.blockableId,
      parentId: input.parentId ?? null,
      kind: input.kind,
      name: input.name ?? null,
      style: input.style,
      position: input.position,
      visible: input.visible,
      details: input.details,
      fieldType: input.fieldType ?? null,
      required: input.required,
      placeholder: input.placeholder,
    }).returning();
    return mapBlock(row!);
  }

  async update(id: string, input: UpdateBlockInput): Promise<BlockRecord> {
    await this.get(id);
    const [row] = await this.db.update(blocks).set({
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.style !== undefined && { style: input.style }),
      ...(input.position !== undefined && { position: input.position }),
      ...(input.visible !== undefined && { visible: input.visible }),
      ...(input.details !== undefined && { details: input.details }),
      ...(input.fieldType !== undefined && { fieldType: input.fieldType }),
      ...(input.required !== undefined && { required: input.required }),
      ...(input.placeholder !== undefined && { placeholder: input.placeholder }),
      updatedAt: new Date(),
    }).where(eq(blocks.id, id)).returning();
    return mapBlock(row!);
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.db.delete(blocks).where(eq(blocks.id, id));
  }

  async reorder(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map((id, i) =>
        this.db.update(blocks).set({ position: i, updatedAt: new Date() }).where(eq(blocks.id, id))
      )
    );
  }
}

function mapBlock(row: typeof blocks.$inferSelect): BlockRecord {
  return {
    id: row.id,
    blockableType: row.blockableType,
    blockableId: row.blockableId,
    parentId: row.parentId ?? null,
    kind: row.kind,
    name: row.name ?? null,
    style: row.style,
    position: row.position,
    visible: row.visible,
    details: row.details as Record<string, unknown>,
    fieldType: row.fieldType ?? null,
    required: row.required,
    placeholder: row.placeholder ?? null,
    lookupKey: row.lookupKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
