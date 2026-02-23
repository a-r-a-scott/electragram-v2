import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  customType,
} from "drizzle-orm/pg-core";

export const contactsSchema = pgSchema("contacts");

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const contactStatusEnum = pgEnum("contact_status", [
  "active",
  "unsubscribed",
  "archived",
  "imported",
]);

export const contactListStatusEnum = pgEnum("contact_list_status", [
  "active",
  "archived",
]);

export const contactFieldKindEnum = pgEnum("contact_field_kind", [
  "text",
  "number",
  "date",
  "boolean",
  "select",
  "multi_select",
]);

// ─── Contacts ─────────────────────────────────────────────────────────────────

export const contacts = contactsSchema.table(
  "contacts",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    whatsapp: varchar("whatsapp", { length: 50 }),
    status: contactStatusEnum("status").notNull().default("active"),
    source: varchar("source", { length: 100 }),
    customFields: jsonb("custom_fields").notNull().default({}),
    emailHash: varchar("email_hash", { length: 64 }),
    dupeKey: varchar("dupe_key", { length: 255 }),
    avatarChecksum: varchar("avatar_checksum", { length: 255 }),
    searchText: tsvector("search_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contacts_account_idx").on(t.accountId),
    index("contacts_email_hash_idx").on(t.accountId, t.emailHash),
    index("contacts_search_idx").using("gin", t.searchText),
  ]
);

// ─── Contact Email Addresses ──────────────────────────────────────────────────

export const contactEmailAddresses = contactsSchema.table(
  "contact_email_addresses",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    contactId: varchar("contact_id", { length: 26 })
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    kind: varchar("kind", { length: 50 }).notNull().default("primary"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    description: varchar("description", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contact_emails_account_email_idx").on(t.accountId, t.email),
  ]
);

// ─── Contact Phone Numbers ────────────────────────────────────────────────────

export const contactPhoneNumbers = contactsSchema.table(
  "contact_phone_numbers",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    contactId: varchar("contact_id", { length: 26 })
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull(),
    kind: varchar("kind", { length: 50 }).notNull().default("mobile"),
    countryCode: varchar("country_code", { length: 10 }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    hasSms: boolean("has_sms").notNull().default(false),
    hasWhatsapp: boolean("has_whatsapp").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contact_phones_account_phone_idx").on(t.accountId, t.phone),
  ]
);

// ─── Contact Lists ────────────────────────────────────────────────────────────

export const contactLists = contactsSchema.table(
  "contact_lists",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: contactListStatusEnum("status").notNull().default("active"),
    membersCount: integer("members_count").notNull().default(0),
    description: text("description"),
    source: varchar("source", { length: 100 }),
    isProtected: boolean("is_protected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contact_lists_account_idx").on(t.accountId)]
);

// ─── Contact List Members ─────────────────────────────────────────────────────

export const contactListMembers = contactsSchema.table(
  "contact_list_members",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    contactListId: varchar("contact_list_id", { length: 26 })
      .notNull()
      .references(() => contactLists.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 26 })
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contact_list_members_list_contact_idx").on(
      t.contactListId,
      t.contactId
    ),
  ]
);

// ─── Contact Fields ───────────────────────────────────────────────────────────

export const contactFields = contactsSchema.table("contact_fields", {
  id: varchar("id", { length: 26 }).primaryKey(),
  accountId: varchar("account_id", { length: 26 }).notNull(),
  eventId: varchar("event_id", { length: 26 }),
  name: varchar("name", { length: 100 }).notNull(),
  kind: contactFieldKindEnum("kind").notNull().default("text"),
  position: integer("position").notNull().default(0),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
