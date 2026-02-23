import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "../db/client.js";
import { messageTemplates } from "../db/schema.js";
import { generateId, buildSearchText, extractVariableKeys } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum(["email", "sms", "whatsapp"]).default("email"),
  subject: z.string().max(500).optional(),
  body: z.string().default(""),
  bodyHtml: z.string().optional(),
  fromName: z.string().max(255).optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial();

export const ListTemplatesQuerySchema = z.object({
  q: z.string().optional(),
  kind: z.enum(["email", "sms", "whatsapp"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
export type ListTemplatesQuery = z.infer<typeof ListTemplatesQuerySchema>;

export interface TemplateRecord {
  id: string;
  accountId: string;
  name: string;
  kind: string;
  subject: string | null;
  body: string;
  bodyHtml: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  status: string;
  variableKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTemplates {
  data: TemplateRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export class TemplatesService {
  constructor(private readonly db: Db) {}

  async listTemplates(
    accountId: string,
    query: ListTemplatesQuery
  ): Promise<PaginatedTemplates> {
    const offset = (query.page - 1) * query.perPage;

    const conditions = [eq(messageTemplates.accountId, accountId)];
    if (query.kind) conditions.push(eq(messageTemplates.kind, query.kind));
    if (query.status) conditions.push(eq(messageTemplates.status, query.status));

    const whereClause = query.q
      ? and(
          ...conditions,
          sql`${messageTemplates.searchText} @@ plainto_tsquery('english', ${query.q})`
        )
      : and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(messageTemplates)
        .where(whereClause)
        .orderBy(messageTemplates.createdAt)
        .limit(query.perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(messageTemplates)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapTemplate),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
    };
  }

  async getTemplate(accountId: string, templateId: string): Promise<TemplateRecord> {
    const [row] = await this.db
      .select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.accountId, accountId)))
      .limit(1);
    if (!row) throw new NotFoundError("Template not found");
    return mapTemplate(row);
  }

  async createTemplate(
    accountId: string,
    input: CreateTemplateInput
  ): Promise<TemplateRecord> {
    const id = generateId("tpl");
    const searchText = buildSearchText(input.name, input.subject, input.body);
    const variableKeys = extractVariableKeys(`${input.subject ?? ""} ${input.body}`);

    const [row] = await this.db
      .insert(messageTemplates)
      .values({
        id,
        accountId,
        name: input.name,
        kind: input.kind ?? "email",
        subject: input.subject ?? null,
        body: input.body ?? "",
        bodyHtml: input.bodyHtml ?? null,
        fromName: input.fromName ?? null,
        fromEmail: input.fromEmail ?? null,
        replyTo: input.replyTo ?? null,
        status: "draft",
        variableKeys,
        searchText: sql`to_tsvector('english', ${searchText})`,
      })
      .returning();

    return mapTemplate(row!);
  }

  async updateTemplate(
    accountId: string,
    templateId: string,
    input: UpdateTemplateInput
  ): Promise<TemplateRecord> {
    const existing = await this.getTemplate(accountId, templateId);

    const body = input.body ?? existing.body;
    const subject = input.subject !== undefined ? input.subject : existing.subject;
    const searchText = buildSearchText(input.name ?? existing.name, subject, body);
    const variableKeys = extractVariableKeys(`${subject ?? ""} ${body}`);

    const [updated] = await this.db
      .update(messageTemplates)
      .set({
        name: input.name ?? existing.name,
        kind: input.kind ?? (existing.kind as any),
        subject: subject ?? null,
        body,
        bodyHtml: input.bodyHtml !== undefined ? input.bodyHtml : existing.bodyHtml,
        fromName: input.fromName !== undefined ? input.fromName : existing.fromName,
        fromEmail: input.fromEmail !== undefined ? input.fromEmail : existing.fromEmail,
        replyTo: input.replyTo !== undefined ? input.replyTo : existing.replyTo,
        variableKeys,
        searchText: sql`to_tsvector('english', ${searchText})`,
        updatedAt: new Date(),
      })
      .where(eq(messageTemplates.id, templateId))
      .returning();

    return mapTemplate(updated!);
  }

  async publishTemplate(accountId: string, templateId: string): Promise<TemplateRecord> {
    await this.getTemplate(accountId, templateId);
    const [updated] = await this.db
      .update(messageTemplates)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(messageTemplates.id, templateId))
      .returning();
    return mapTemplate(updated!);
  }

  async archiveTemplate(accountId: string, templateId: string): Promise<void> {
    await this.getTemplate(accountId, templateId);
    await this.db
      .update(messageTemplates)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(messageTemplates.id, templateId));
  }

  async deleteTemplate(accountId: string, templateId: string): Promise<void> {
    await this.getTemplate(accountId, templateId);
    await this.db.delete(messageTemplates).where(eq(messageTemplates.id, templateId));
  }
}

function mapTemplate(row: typeof messageTemplates.$inferSelect): TemplateRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    kind: row.kind,
    subject: row.subject ?? null,
    body: row.body,
    bodyHtml: row.bodyHtml ?? null,
    fromName: row.fromName ?? null,
    fromEmail: row.fromEmail ?? null,
    replyTo: row.replyTo ?? null,
    status: row.status,
    variableKeys: row.variableKeys as string[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
