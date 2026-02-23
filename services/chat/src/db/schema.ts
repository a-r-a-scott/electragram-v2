import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const chatSchema = pgSchema("chat");

const tsvector = customType<{ data: string }>({
  dataType() { return "tsvector"; },
});

// Enums
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "resolved", "opted_out"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageStatusEnum = pgEnum("message_status", ["pending", "sent", "delivered", "failed"]);
export const sourceStatusEnum = pgEnum("source_status", ["active", "inactive"]);
export const contactableStatusEnum = pgEnum("contactable_status", ["active", "opted_out"]);

/** Configured Twilio phone/WhatsApp numbers owned by an account */
export const chatSources = chatSchema.table(
  "chat_sources",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    status: sourceStatusEnum("status").notNull().default("active"),
    channel: varchar("channel", { length: 20 }).notNull(),
    provider: varchar("provider", { length: 30 }).notNull().default("twilio"),
    handle: varchar("handle", { length: 100 }).notNull(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    credentialId: varchar("credential_id", { length: 26 }),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_chat_source_channel_handle").on(t.channel, t.handle),
    index("idx_chat_source_account").on(t.accountId),
  ],
);

/** External contact's phone/channel handle (e.g. +447700900123 on SMS) */
export const chatIdentities = chatSchema.table(
  "chat_identities",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    handle: varchar("handle", { length: 100 }),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull(),
    optedInAt: timestamp("opted_in_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_identity_account").on(t.accountId),
  ],
);

/** Links a ChatIdentity to a Contact or Guest */
export const chatIdentityContactables = chatSchema.table(
  "chat_identity_contactables",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    contactableType: varchar("contactable_type", { length: 100 }).notNull(),
    contactableId: varchar("contactable_id", { length: 26 }).notNull(),
    identityId: varchar("identity_id", { length: 26 }).notNull(),
    status: contactableStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_identity_contactable_type").on(t.contactableType, t.contactableId),
    index("idx_chat_identity_contactable_identity").on(t.identityId),
  ],
);

/** A conversation between a Source (our number) and an Identity (their number) */
export const chatConversations = chatSchema.table(
  "chat_conversations",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    status: conversationStatusEnum("status").notNull().default("open"),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    sourceId: varchar("source_id", { length: 26 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull(),
    provider: varchar("provider", { length: 30 }).notNull().default("twilio"),
    handle: varchar("handle", { length: 100 }).notNull(),
    identityId: varchar("identity_id", { length: 26 }),
    unreadAt: timestamp("unread_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    searchText: text("search_text"),
    searchTextTsv: tsvector("search_text_tsv"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_conv_account").on(t.accountId),
    index("idx_chat_conv_source").on(t.sourceId),
    index("idx_chat_conv_identity").on(t.identityId),
    index("idx_chat_conv_last_message").on(t.lastMessageAt),
    index("idx_chat_conv_unread").on(t.unreadAt),
  ],
);

/** An individual SMS / WhatsApp message in a conversation */
export const chatMessages = chatSchema.table(
  "chat_messages",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    direction: messageDirectionEnum("direction").notNull().default("inbound"),
    status: messageStatusEnum("status").notNull().default("pending"),
    content: text("content"),
    externalMessageKey: varchar("external_message_key", { length: 100 }),
    conversationId: varchar("conversation_id", { length: 26 }).notNull(),
    mediaUrls: varchar("media_urls", { length: 500 }).array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_message_conversation").on(t.conversationId),
  ],
);

/** Broadcast chat — named group linked to a message campaign */
export const chats = chatSchema.table(
  "chats",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    name: varchar("name", { length: 255 }),
    kind: integer("kind").notNull().default(0),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    unreadAt: timestamp("unread_at", { withTimezone: true }),
    sourceMessageId: varchar("source_message_id", { length: 26 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chats_account").on(t.accountId),
  ],
);

/** Groups a set of chats together */
export const chatGroups = chatSchema.table(
  "chat_groups",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    name: varchar("name", { length: 255 }),
    kind: integer("kind"),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_group_account").on(t.accountId),
  ],
);

/** Links a Chat to a Conversation */
export const chatMemberships = chatSchema.table(
  "chat_memberships",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    chatId: varchar("chat_id", { length: 26 }).notNull(),
    conversationId: varchar("conversation_id", { length: 26 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_membership_chat").on(t.chatId),
    index("idx_chat_membership_conv").on(t.conversationId),
  ],
);

/** Per-contactable thread within a Chat (for group campaigns) */
export const chatThreads = chatSchema.table(
  "chat_threads",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    status: conversationStatusEnum("status").notNull().default("open"),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    sourceId: varchar("source_id", { length: 26 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull(),
    provider: varchar("provider", { length: 30 }).notNull().default("twilio"),
    handle: varchar("handle", { length: 100 }).notNull(),
    contactableType: varchar("contactable_type", { length: 100 }).notNull(),
    contactableId: varchar("contactable_id", { length: 26 }).notNull(),
    chatGroupId: varchar("chat_group_id", { length: 26 }),
    optedInAt: timestamp("opted_in_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_chat_thread_source_handle").on(t.sourceId, t.handle),
    index("idx_chat_thread_account").on(t.accountId),
    index("idx_chat_thread_contactable").on(t.contactableType, t.contactableId),
    index("idx_chat_thread_group").on(t.chatGroupId),
  ],
);
