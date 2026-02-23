import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { themeTemplates } from "../db/schema.js";
import { generateId, extractVariableKeys } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  kind: z.enum(["invitation", "email", "event_page", "rsvp_form", "general"]).default("email"),
  subject: z.string().max(500).optional(),
  preheader: z.string().max(255).optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  fromName: z.string().max(255).optional(),
  fromEmail: z.string().email().optional(),
  details: z.record(z.unknown()).default({}),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial();

export const ListTemplatesQuerySchema = z.object({
  kind: z.enum(["invitation", "email", "event_page", "rsvp_form", "general"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
export type ListTemplatesQuery = z.infer<typeof ListTemplatesQuerySchema>;

export interface TemplateRecord {
  id: string;
  themeId: string;
  name: string;
  description: string | null;
  kind: string;
  status: string;
  position: number | null;
  subject: string | null;
  preheader: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  fromName: string | null;
  fromEmail: string | null;
  variableKeys: string[];
  details: Record<string, unknown>;
  lookupKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTemplates {
  data: TemplateRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export class TemplatesService {
  constructor(private readonly db: Db) {}

  async list(themeId: string, query: ListTemplatesQuery): Promise<PaginatedTemplates> {
    const offset = (query.page - 1) * query.perPage;
    const conditions = [eq(themeTemplates.themeId, themeId)];
    if (query.kind) conditions.push(eq(themeTemplates.kind, query.kind));
    if (query.status) conditions.push(eq(themeTemplates.status, query.status));
    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(themeTemplates).where(where)
        .orderBy(themeTemplates.position, themeTemplates.name)
        .limit(query.perPage).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(themeTemplates).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapTemplate),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
    };
  }

  async get(themeId: string, templateId: string): Promise<TemplateRecord> {
    const [row] = await this.db.select().from(themeTemplates)
      .where(and(eq(themeTemplates.id, templateId), eq(themeTemplates.themeId, themeId)))
      .limit(1);
    if (!row) throw new NotFoundError("Template not found");
    return mapTemplate(row);
  }

  async getById(templateId: string): Promise<TemplateRecord> {
    const [row] = await this.db.select().from(themeTemplates)
      .where(eq(themeTemplates.id, templateId)).limit(1);
    if (!row) throw new NotFoundError("Template not found");
    return mapTemplate(row);
  }

  async create(themeId: string, input: CreateTemplateInput): Promise<TemplateRecord> {
    const variableKeys = extractVariableKeys(
      `${input.subject ?? ""} ${input.bodyHtml ?? ""} ${input.bodyText ?? ""}`
    );
    const [row] = await this.db.insert(themeTemplates).values({
      id: generateId("tpl"),
      themeId,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      status: "draft",
      subject: input.subject ?? null,
      preheader: input.preheader ?? null,
      bodyHtml: input.bodyHtml ?? null,
      bodyText: input.bodyText ?? null,
      fromName: input.fromName ?? null,
      fromEmail: input.fromEmail ?? null,
      variableKeys,
      details: input.details,
    }).returning();
    return mapTemplate(row!);
  }

  async update(themeId: string, templateId: string, input: UpdateTemplateInput): Promise<TemplateRecord> {
    const existing = await this.get(themeId, templateId);
    const bodyHtml = input.bodyHtml !== undefined ? input.bodyHtml : existing.bodyHtml;
    const bodyText = input.bodyText !== undefined ? input.bodyText : existing.bodyText;
    const subject = input.subject !== undefined ? input.subject : existing.subject;
    const variableKeys = extractVariableKeys(`${subject ?? ""} ${bodyHtml ?? ""} ${bodyText ?? ""}`);

    const [row] = await this.db.update(themeTemplates).set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.subject !== undefined && { subject }),
      ...(input.preheader !== undefined && { preheader: input.preheader }),
      ...(input.bodyHtml !== undefined && { bodyHtml }),
      ...(input.bodyText !== undefined && { bodyText }),
      ...(input.fromName !== undefined && { fromName: input.fromName }),
      ...(input.fromEmail !== undefined && { fromEmail: input.fromEmail }),
      ...(input.details !== undefined && { details: input.details }),
      variableKeys,
      updatedAt: new Date(),
    }).where(eq(themeTemplates.id, templateId)).returning();
    return mapTemplate(row!);
  }

  async publish(themeId: string, templateId: string): Promise<TemplateRecord> {
    await this.get(themeId, templateId);
    const [row] = await this.db.update(themeTemplates)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(themeTemplates.id, templateId)).returning();
    return mapTemplate(row!);
  }

  async archive(themeId: string, templateId: string): Promise<void> {
    await this.get(themeId, templateId);
    await this.db.update(themeTemplates)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(themeTemplates.id, templateId));
  }

  async delete(themeId: string, templateId: string): Promise<void> {
    await this.get(themeId, templateId);
    await this.db.delete(themeTemplates).where(eq(themeTemplates.id, templateId));
  }
}

export function mapTemplate(row: typeof themeTemplates.$inferSelect): TemplateRecord {
  return {
    id: row.id,
    themeId: row.themeId,
    name: row.name,
    description: row.description ?? null,
    kind: row.kind,
    status: row.status,
    position: row.position ?? null,
    subject: row.subject ?? null,
    preheader: row.preheader ?? null,
    bodyHtml: row.bodyHtml ?? null,
    bodyText: row.bodyText ?? null,
    fromName: row.fromName ?? null,
    fromEmail: row.fromEmail ?? null,
    variableKeys: row.variableKeys as string[],
    details: row.details as Record<string, unknown>,
    lookupKey: row.lookupKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
