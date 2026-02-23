import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "../db/client.js";
import {
  messages,
  messageRecipients,
  messageRecipientLists,
  unsubscribes,
  dispatchJobs,
} from "../db/schema.js";
import { generateId, buildSearchText } from "../utils/id.js";
import { NotFoundError, ValidationError, ConflictError } from "./errors.js";
import type { SqsDispatcher } from "./sqs.service.js";

export const CreateMessageSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum(["email", "sms", "whatsapp"]).default("email"),
  eventId: z.string().optional(),
  templateId: z.string().optional(),
  subject: z.string().max(500).optional(),
  body: z.string().default(""),
  bodyHtml: z.string().optional(),
  fromName: z.string().max(255).optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  triggerKind: z
    .enum(["manual", "scheduled", "event_trigger", "rsvp_trigger", "date_trigger"])
    .default("manual"),
  scheduledAt: z.string().datetime().optional(),
  triggerConfig: z.record(z.unknown()).optional().default({}),
});

export const UpdateMessageSchema = CreateMessageSchema.partial();

export const ScheduleMessageSchema = z.object({
  scheduledAt: z.string().datetime(),
});

export const SetRecipientsSchema = z.object({
  guestIds: z.array(z.string()).optional().default([]),
  listIds: z.array(
    z.object({
      listId: z.string(),
      listKind: z.string().default("event_list"),
    })
  ).optional().default([]),
});

export const ListMessagesQuerySchema = z.object({
  q: z.string().optional(),
  status: z
    .enum(["draft", "scheduled", "sending", "sent", "paused", "cancelled", "failed"])
    .optional(),
  eventId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;
export type UpdateMessageInput = z.infer<typeof UpdateMessageSchema>;
export type ScheduleMessageInput = z.infer<typeof ScheduleMessageSchema>;
export type SetRecipientsInput = z.infer<typeof SetRecipientsSchema>;
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;

export interface MessageRecord {
  id: string;
  accountId: string;
  eventId: string | null;
  templateId: string | null;
  name: string;
  kind: string;
  subject: string | null;
  body: string;
  bodyHtml: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  status: string;
  triggerKind: string;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  bouncedCount: number;
  openCount: number;
  clickCount: number;
  unsubscribeCount: number;
  triggerConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RecipientRecord {
  id: string;
  messageId: string;
  accountId: string;
  guestId: string | null;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  externalId: string | null;
  failureReason: string | null;
  queuedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedMessages {
  data: MessageRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export interface PaginatedRecipients {
  data: RecipientRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export interface DispatchResult {
  messageId: string;
  recipientsQueued: number;
  recipientsSkipped: number;
}

export class MessagesService {
  constructor(
    private readonly db: Db,
    private readonly sqs: SqsDispatcher
  ) {}

  async listMessages(
    accountId: string,
    query: ListMessagesQuery
  ): Promise<PaginatedMessages> {
    const offset = (query.page - 1) * query.perPage;

    const conditions = [eq(messages.accountId, accountId)];
    if (query.status) conditions.push(eq(messages.status, query.status));
    if (query.eventId) conditions.push(eq(messages.eventId, query.eventId));

    const whereClause = query.q
      ? and(
          ...conditions,
          sql`${messages.searchText} @@ plainto_tsquery('english', ${query.q})`
        )
      : and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(messages)
        .where(whereClause)
        .orderBy(messages.createdAt)
        .limit(query.perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapMessage),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
    };
  }

  async getMessage(accountId: string, messageId: string): Promise<MessageRecord> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.accountId, accountId)))
      .limit(1);
    if (!row) throw new NotFoundError("Message not found");
    return mapMessage(row);
  }

  async createMessage(
    accountId: string,
    input: CreateMessageInput
  ): Promise<MessageRecord> {
    if (input.scheduledAt && input.triggerKind === "manual") {
      throw new ValidationError("scheduledAt requires triggerKind 'scheduled'");
    }

    const id = generateId("msg");
    const searchText = buildSearchText(input.name, input.subject, input.body);

    const [msg] = await this.db
      .insert(messages)
      .values({
        id,
        accountId,
        eventId: input.eventId ?? null,
        templateId: input.templateId ?? null,
        name: input.name,
        kind: input.kind ?? "email",
        subject: input.subject ?? null,
        body: input.body ?? "",
        bodyHtml: input.bodyHtml ?? null,
        fromName: input.fromName ?? null,
        fromEmail: input.fromEmail ?? null,
        replyTo: input.replyTo ?? null,
        status: "draft",
        triggerKind: input.triggerKind ?? "manual",
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        triggerConfig: input.triggerConfig ?? {},
        searchText: sql`to_tsvector('english', ${searchText})`,
      })
      .returning();

    return mapMessage(msg!);
  }

  async updateMessage(
    accountId: string,
    messageId: string,
    input: UpdateMessageInput
  ): Promise<MessageRecord> {
    const existing = await this.getMessage(accountId, messageId);

    if (!["draft", "scheduled", "paused"].includes(existing.status)) {
      throw new ConflictError("Cannot edit a message that is sending or sent");
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.kind !== undefined) updates.kind = input.kind;
    if (input.eventId !== undefined) updates.eventId = input.eventId;
    if (input.templateId !== undefined) updates.templateId = input.templateId;
    if (input.subject !== undefined) updates.subject = input.subject;
    if (input.body !== undefined) updates.body = input.body;
    if (input.bodyHtml !== undefined) updates.bodyHtml = input.bodyHtml;
    if (input.fromName !== undefined) updates.fromName = input.fromName;
    if (input.fromEmail !== undefined) updates.fromEmail = input.fromEmail;
    if (input.replyTo !== undefined) updates.replyTo = input.replyTo;
    if (input.triggerKind !== undefined) updates.triggerKind = input.triggerKind;
    if (input.scheduledAt !== undefined) updates.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.triggerConfig !== undefined) updates.triggerConfig = input.triggerConfig;

    const name = (input.name ?? existing.name) as string;
    const subject = (input.subject !== undefined ? input.subject : existing.subject) as string | null;
    const body = (input.body ?? existing.body) as string;
    updates.searchText = sql`to_tsvector('english', ${buildSearchText(name, subject, body)})`;

    const [updated] = await this.db
      .update(messages)
      .set(updates)
      .where(eq(messages.id, messageId))
      .returning();

    return mapMessage(updated!);
  }

  async scheduleMessage(
    accountId: string,
    messageId: string,
    input: ScheduleMessageInput
  ): Promise<MessageRecord> {
    const existing = await this.getMessage(accountId, messageId);
    if (!["draft", "paused"].includes(existing.status)) {
      throw new ConflictError("Message cannot be scheduled in its current state");
    }

    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new ValidationError("scheduled_at must be in the future");
    }

    const [updated] = await this.db
      .update(messages)
      .set({ status: "scheduled", scheduledAt, triggerKind: "scheduled", updatedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning();

    return mapMessage(updated!);
  }

  async setRecipients(
    accountId: string,
    messageId: string,
    input: SetRecipientsInput
  ): Promise<{ added: number }> {
    await this.requireEditableMessage(accountId, messageId);

    // Wipe existing recipients + lists for this message
    await this.db
      .delete(messageRecipients)
      .where(eq(messageRecipients.messageId, messageId));
    await this.db
      .delete(messageRecipientLists)
      .where(eq(messageRecipientLists.messageId, messageId));

    let added = 0;

    // Direct guest recipients
    if (input.guestIds.length > 0) {
      const recipientValues = input.guestIds.map((guestId) => ({
        id: generateId("rcp"),
        messageId,
        accountId,
        guestId,
        status: "pending" as const,
      }));
      await this.db.insert(messageRecipients).values(recipientValues);
      added += recipientValues.length;
    }

    // List references (expanded at dispatch time by the Delivery worker)
    if (input.listIds.length > 0) {
      const listValues = input.listIds.map((l) => ({
        id: generateId("rl"),
        messageId,
        listId: l.listId,
        listKind: l.listKind,
      }));
      await this.db.insert(messageRecipientLists).values(listValues);
    }

    // Update denormalised count
    await this.db
      .update(messages)
      .set({ recipientCount: added, updatedAt: new Date() })
      .where(eq(messages.id, messageId));

    return { added };
  }

  async listRecipients(
    accountId: string,
    messageId: string,
    page = 1,
    perPage = 50
  ): Promise<PaginatedRecipients> {
    await this.getMessage(accountId, messageId);
    const offset = (page - 1) * perPage;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(messageRecipients)
        .where(eq(messageRecipients.messageId, messageId))
        .orderBy(messageRecipients.createdAt)
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(messageRecipients)
        .where(eq(messageRecipients.messageId, messageId)),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(mapRecipient),
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async dispatch(
    accountId: string,
    messageId: string
  ): Promise<DispatchResult> {
    const msg = await this.getMessage(accountId, messageId);

    if (!["draft", "scheduled", "paused"].includes(msg.status)) {
      throw new ConflictError("Message is already sending or has been sent");
    }

    // Mark as sending
    await this.db
      .update(messages)
      .set({ status: "sending", updatedAt: new Date() })
      .where(eq(messages.id, messageId));

    // Fetch recipients
    const allRecipients = await this.db
      .select()
      .from(messageRecipients)
      .where(
        and(
          eq(messageRecipients.messageId, messageId),
          eq(messageRecipients.status, "pending")
        )
      );

    // Filter out unsubscribes
    const emails = allRecipients
      .filter((r) => r.email)
      .map((r) => r.email as string);

    let unsubscribedEmails = new Set<string>();
    if (emails.length > 0) {
      const rows = await this.db
        .select({ email: unsubscribes.email })
        .from(unsubscribes)
        .where(
          and(
            eq(unsubscribes.accountId, accountId),
            inArray(unsubscribes.email, emails)
          )
        );
      unsubscribedEmails = new Set(rows.map((r) => r.email as string));
    }

    let queued = 0;
    let skipped = 0;

    for (const recipient of allRecipients) {
      if (recipient.email && unsubscribedEmails.has(recipient.email)) {
        await this.db
          .update(messageRecipients)
          .set({ status: "skipped", updatedAt: new Date() })
          .where(eq(messageRecipients.id, recipient.id));
        skipped++;
        continue;
      }

      const payload = {
        messageId,
        recipientId: recipient.id,
        accountId,
        kind: msg.kind,
        to: recipient.email ?? recipient.phone ?? "",
        subject: msg.subject ?? "",
        body: msg.body,
        bodyHtml: msg.bodyHtml ?? null,
        fromName: msg.fromName ?? null,
        fromEmail: msg.fromEmail ?? null,
        replyTo: msg.replyTo ?? null,
        firstName: recipient.firstName ?? null,
        lastName: recipient.lastName ?? null,
      };

      const sqsMessageId = await this.sqs.send(payload);

      const jobId = generateId("job");
      await this.db.insert(dispatchJobs).values({
        id: jobId,
        messageId,
        recipientId: recipient.id,
        sqsMessageId,
        status: "queued",
        payload,
      });

      await this.db
        .update(messageRecipients)
        .set({ status: "queued", queuedAt: new Date(), updatedAt: new Date() })
        .where(eq(messageRecipients.id, recipient.id));

      queued++;
    }

    // Final status: if nothing to send, mark sent immediately
    const finalStatus = queued > 0 ? "sending" : "sent";
    await this.db
      .update(messages)
      .set({
        status: finalStatus,
        sentAt: finalStatus === "sent" ? new Date() : null,
        recipientCount: queued + skipped,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId));

    return { messageId, recipientsQueued: queued, recipientsSkipped: skipped };
  }

  async cancelMessage(accountId: string, messageId: string): Promise<MessageRecord> {
    const existing = await this.getMessage(accountId, messageId);
    if (existing.status === "sent") {
      throw new ConflictError("Cannot cancel a message that has already been sent");
    }

    const [updated] = await this.db
      .update(messages)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning();

    return mapMessage(updated!);
  }

  async deleteMessage(accountId: string, messageId: string): Promise<void> {
    const existing = await this.getMessage(accountId, messageId);
    if (["sending", "sent"].includes(existing.status)) {
      throw new ConflictError("Cannot delete a message that is sending or sent");
    }
    await this.db.delete(messages).where(eq(messages.id, messageId));
  }

  private async requireEditableMessage(
    accountId: string,
    messageId: string
  ): Promise<void> {
    const msg = await this.getMessage(accountId, messageId);
    if (!["draft", "scheduled", "paused"].includes(msg.status)) {
      throw new ConflictError("Cannot modify recipients of a message in its current state");
    }
  }
}

function mapMessage(row: typeof messages.$inferSelect): MessageRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    eventId: row.eventId ?? null,
    templateId: row.templateId ?? null,
    name: row.name,
    kind: row.kind,
    subject: row.subject ?? null,
    body: row.body,
    bodyHtml: row.bodyHtml ?? null,
    fromName: row.fromName ?? null,
    fromEmail: row.fromEmail ?? null,
    replyTo: row.replyTo ?? null,
    status: row.status,
    triggerKind: row.triggerKind,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    recipientCount: row.recipientCount,
    deliveredCount: row.deliveredCount,
    failedCount: row.failedCount,
    bouncedCount: row.bouncedCount,
    openCount: row.openCount,
    clickCount: row.clickCount,
    unsubscribeCount: row.unsubscribeCount,
    triggerConfig: row.triggerConfig as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRecipient(row: typeof messageRecipients.$inferSelect): RecipientRecord {
  return {
    id: row.id,
    messageId: row.messageId,
    accountId: row.accountId,
    guestId: row.guestId ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    status: row.status,
    externalId: row.externalId ?? null,
    failureReason: row.failureReason ?? null,
    queuedAt: row.queuedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
