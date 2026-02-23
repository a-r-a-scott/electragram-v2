import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const messagingSchema = pgSchema("messaging");

const tsvector = customType<{ data: string }>({
  dataType() { return "tsvector"; },
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const messageStatusEnum = pgEnum("message_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "paused",
  "cancelled",
  "failed",
]);

export const messageKindEnum = pgEnum("message_kind", [
  "email",
  "sms",
  "whatsapp",
]);

export const messageTriggerKindEnum = pgEnum("message_trigger_kind", [
  "manual",
  "scheduled",
  "event_trigger",
  "rsvp_trigger",
  "date_trigger",
]);

export const recipientStatusEnum = pgEnum("recipient_status", [
  "pending",
  "queued",
  "delivered",
  "failed",
  "bounced",
  "unsubscribed",
  "skipped",
]);

export const templateStatusEnum = pgEnum("template_status", [
  "draft",
  "active",
  "archived",
]);

// ─── Message Templates ────────────────────────────────────────────────────────

export const messageTemplates = messagingSchema.table(
  "message_templates",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    kind: messageKindEnum("kind").notNull().default("email"),
    subject: varchar("subject", { length: 500 }),
    body: text("body").notNull().default(""),
    bodyHtml: text("body_html"),
    fromName: varchar("from_name", { length: 255 }),
    fromEmail: varchar("from_email", { length: 255 }),
    replyTo: varchar("reply_to", { length: 255 }),
    status: templateStatusEnum("status").notNull().default("draft"),
    variableKeys: jsonb("variable_keys").notNull().default([]),
    searchText: tsvector("search_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("msg_templates_account_idx").on(t.accountId),
    index("msg_templates_search_idx").using("gin", t.searchText),
  ]
);

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = messagingSchema.table(
  "messages",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    eventId: varchar("event_id", { length: 26 }),
    templateId: varchar("template_id", { length: 26 }),
    name: varchar("name", { length: 255 }).notNull(),
    kind: messageKindEnum("kind").notNull().default("email"),
    subject: varchar("subject", { length: 500 }),
    body: text("body").notNull().default(""),
    bodyHtml: text("body_html"),
    fromName: varchar("from_name", { length: 255 }),
    fromEmail: varchar("from_email", { length: 255 }),
    replyTo: varchar("reply_to", { length: 255 }),
    status: messageStatusEnum("status").notNull().default("draft"),
    triggerKind: messageTriggerKindEnum("trigger_kind").notNull().default("manual"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    recipientCount: integer("recipient_count").notNull().default(0),
    deliveredCount: integer("delivered_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    bouncedCount: integer("bounced_count").notNull().default(0),
    openCount: integer("open_count").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),
    unsubscribeCount: integer("unsubscribe_count").notNull().default(0),
    triggerConfig: jsonb("trigger_config").notNull().default({}),
    searchText: tsvector("search_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_account_idx").on(t.accountId),
    index("messages_event_idx").on(t.eventId),
    index("messages_status_idx").on(t.status),
    index("messages_scheduled_idx").on(t.scheduledAt),
    index("messages_search_idx").using("gin", t.searchText),
  ]
);

// ─── Message Recipients ───────────────────────────────────────────────────────

export const messageRecipients = messagingSchema.table(
  "message_recipients",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    messageId: varchar("message_id", { length: 26 })
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    guestId: varchar("guest_id", { length: 26 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    status: recipientStatusEnum("status").notNull().default("pending"),
    externalId: varchar("external_id", { length: 255 }),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata").notNull().default({}),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("msg_recipients_message_idx").on(t.messageId),
    index("msg_recipients_guest_idx").on(t.guestId),
    index("msg_recipients_status_idx").on(t.messageId, t.status),
  ]
);

// ─── Message Recipient Lists (audience segments) ──────────────────────────────

export const messageRecipientLists = messagingSchema.table(
  "message_recipient_lists",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    messageId: varchar("message_id", { length: 26 })
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    listId: varchar("list_id", { length: 26 }).notNull(),
    listKind: varchar("list_kind", { length: 50 }).notNull().default("event_list"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("msg_recipient_lists_msg_idx").on(t.messageId)]
);

// ─── Unsubscribes ─────────────────────────────────────────────────────────────

export const unsubscribes = messagingSchema.table(
  "unsubscribes",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    guestId: varchar("guest_id", { length: 26 }),
    messageId: varchar("message_id", { length: 26 }),
    reason: varchar("reason", { length: 255 }),
    isGlobal: boolean("is_global").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("unsubscribes_account_email_idx").on(t.accountId, t.email),
    index("unsubscribes_guest_idx").on(t.guestId),
  ]
);

// ─── Dispatch Jobs (SQS envelope tracking) ───────────────────────────────────

export const dispatchJobs = messagingSchema.table(
  "dispatch_jobs",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    messageId: varchar("message_id", { length: 26 })
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    recipientId: varchar("recipient_id", { length: 26 })
      .notNull()
      .references(() => messageRecipients.id, { onDelete: "cascade" }),
    sqsMessageId: varchar("sqs_message_id", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dispatch_jobs_message_idx").on(t.messageId),
    index("dispatch_jobs_status_idx").on(t.status),
  ]
);
