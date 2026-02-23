import { eq, and } from "drizzle-orm";
import { z } from "zod";
// slugify ships as CJS; cast to bypass ESM default-export typing
import slugify_ from "slugify";
const slugifyLib = slugify_ as unknown as (value: string, options?: Record<string, unknown>) => string;

import type { Db } from "../db/client.js";
import { eventPages } from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError, ConflictError } from "./errors.js";

export const CreatePageSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  kind: z.enum(["registration", "information", "confirmation"]).default("registration"),
  slug: z.string().min(1).max(255).optional(),
  templateId: z.string().optional(),
});

export const UpdatePageSchema = CreatePageSchema.partial().extend({
  status: z.enum(["draft", "active", "archived"]).optional(),
  isActive: z.boolean().optional(),
});

export type CreatePageInput = z.infer<typeof CreatePageSchema>;
export type UpdatePageInput = z.infer<typeof UpdatePageSchema>;

export interface PageRecord {
  id: string;
  eventId: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  kind: string;
  templateId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class PagesService {
  constructor(private readonly db: Db) {}

  async listPages(eventId: string): Promise<PageRecord[]> {
    const pages = await this.db
      .select()
      .from(eventPages)
      .where(eq(eventPages.eventId, eventId))
      .orderBy(eventPages.createdAt);
    return pages.map(mapPage);
  }

  async getPage(eventId: string, pageId: string): Promise<PageRecord> {
    const [row] = await this.db
      .select()
      .from(eventPages)
      .where(and(eq(eventPages.id, pageId), eq(eventPages.eventId, eventId)))
      .limit(1);
    if (!row) throw new NotFoundError("Page not found");
    return mapPage(row);
  }

  async getPageBySlug(slug: string): Promise<PageRecord> {
    const [row] = await this.db
      .select()
      .from(eventPages)
      .where(eq(eventPages.slug, slug))
      .limit(1);
    if (!row) throw new NotFoundError("Page not found");
    return mapPage(row);
  }

  async createPage(eventId: string, input: CreatePageInput): Promise<PageRecord> {
    const slug = input.slug
      ? slugifyLib(input.slug, { lower: true, strict: true })
      : slugifyLib(`${input.name}-${Date.now()}`, { lower: true, strict: true });

    const [conflict] = await this.db
      .select({ id: eventPages.id })
      .from(eventPages)
      .where(eq(eventPages.slug, slug))
      .limit(1);
    if (conflict) throw new ConflictError("A page with this slug already exists");

    const id = generateId("pge");
    const [page] = await this.db
      .insert(eventPages)
      .values({
        id,
        eventId,
        name: input.name,
        slug,
        description: input.description ?? null,
        kind: input.kind ?? "registration",
        templateId: input.templateId ?? null,
        status: "draft",
        isActive: false,
      })
      .returning();

    return mapPage(page!);
  }

  async updatePage(
    eventId: string,
    pageId: string,
    input: UpdatePageInput
  ): Promise<PageRecord> {
    const [existing] = await this.db
      .select()
      .from(eventPages)
      .where(and(eq(eventPages.id, pageId), eq(eventPages.eventId, eventId)))
      .limit(1);
    if (!existing) throw new NotFoundError("Page not found");

    let slug = existing.slug;
    if (input.slug && input.slug !== existing.slug) {
      slug = slugifyLib(input.slug, { lower: true, strict: true });
      const [conflict] = await this.db
        .select({ id: eventPages.id })
        .from(eventPages)
        .where(eq(eventPages.slug, slug))
        .limit(1);
      if (conflict) throw new ConflictError("A page with this slug already exists");
    }

    const [updated] = await this.db
      .update(eventPages)
      .set({
        name: input.name ?? existing.name,
        slug,
        description: input.description !== undefined ? input.description : existing.description,
        status: input.status ?? existing.status,
        kind: input.kind ?? existing.kind,
        isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
        templateId:
          input.templateId !== undefined ? input.templateId : existing.templateId,
        updatedAt: new Date(),
      })
      .where(eq(eventPages.id, pageId))
      .returning();

    return mapPage(updated!);
  }

  async publishPage(eventId: string, pageId: string): Promise<PageRecord> {
    const [existing] = await this.db
      .select()
      .from(eventPages)
      .where(and(eq(eventPages.id, pageId), eq(eventPages.eventId, eventId)))
      .limit(1);
    if (!existing) throw new NotFoundError("Page not found");

    const [updated] = await this.db
      .update(eventPages)
      .set({ status: "active", isActive: true, updatedAt: new Date() })
      .where(eq(eventPages.id, pageId))
      .returning();

    return mapPage(updated!);
  }

  async deletePage(eventId: string, pageId: string): Promise<void> {
    const result = await this.db
      .delete(eventPages)
      .where(and(eq(eventPages.id, pageId), eq(eventPages.eventId, eventId)));
    if (result.rowCount === 0) throw new NotFoundError("Page not found");
  }
}

function mapPage(row: typeof eventPages.$inferSelect): PageRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    status: row.status,
    kind: row.kind,
    templateId: row.templateId ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
