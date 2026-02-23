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
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const eventsSchema = pgSchema("events");

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const eventStatusEnum = pgEnum("event_status", ["active", "archived"]);

export const guestStatusEnum = pgEnum("guest_status", [
  "pending",
  "invited",
  "accepted",
  "declined",
  "archived",
  "registered",
  "unsubscribed",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "attending",
  "not_attending",
  "maybe",
]);

export const formFieldKindEnum = pgEnum("form_field_kind", [
  "text",
  "textarea",
  "email",
  "phone",
  "select",
  "multi_select",
  "checkbox",
  "date",
  "number",
]);

export const pageStatusEnum = pgEnum("page_status", [
  "draft",
  "active",
  "archived",
]);

export const pageKindEnum = pgEnum("page_kind", [
  "registration",
  "information",
  "confirmation",
]);

// ─── Events ───────────────────────────────────────────────────────────────────

export const events = eventsSchema.table(
  "events",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: eventStatusEnum("status").notNull().default("active"),
    guestsCount: integer("guests_count").notNull().default(0),
    listsCount: integer("lists_count").notNull().default(0),
    capacityMax: integer("capacity_max"),
    capacityCount: integer("capacity_count").notNull().default(0),
    isOpen: boolean("is_open").notNull().default(true),
    abilityToAddAttendee: boolean("ability_to_add_attendee").notNull().default(true),
    searchText: tsvector("search_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_account_idx").on(t.accountId),
    index("events_search_idx").using("gin", t.searchText),
  ]
);

// ─── Guests (master guest record, deduped across events) ──────────────────────

export const guests = eventsSchema.table(
  "guests",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    whatsapp: varchar("whatsapp", { length: 50 }),
    preferredChannel: varchar("preferred_channel", { length: 20 }).default("email"),
    emailOptin: boolean("email_optin").notNull().default(true),
    customFields: jsonb("custom_fields").notNull().default({}),
    emailHash: varchar("email_hash", { length: 64 }),
    dupeKey: varchar("dupe_key", { length: 255 }),
    avatarChecksum: varchar("avatar_checksum", { length: 255 }),
    searchText: tsvector("search_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("guests_account_idx").on(t.accountId),
    index("guests_email_hash_idx").on(t.accountId, t.emailHash),
    index("guests_search_idx").using("gin", t.searchText),
  ]
);

// ─── Event Guests (join: guest × event with status) ───────────────────────────

export const eventGuests = eventsSchema.table(
  "event_guests",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    eventId: varchar("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestId: varchar("guest_id", { length: 26 })
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    status: guestStatusEnum("status").notNull().default("pending"),
    hasResponded: boolean("has_responded").notNull().default(false),
    attendanceStatus: attendanceStatusEnum("attendance_status"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    seatNumber: varchar("seat_number", { length: 50 }),
    tableNumber: varchar("table_number", { length: 50 }),
    eventMessageSettings: jsonb("event_message_settings").notNull().default({}),
    attendeesCount: integer("attendees_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_guests_event_guest_idx").on(t.eventId, t.guestId),
    index("event_guests_event_idx").on(t.eventId),
    index("event_guests_guest_idx").on(t.guestId),
  ]
);

// ─── Event Guest Profiles ─────────────────────────────────────────────────────

export const eventGuestProfiles = eventsSchema.table(
  "event_guest_profiles",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    eventGuestId: varchar("event_guest_id", { length: 26 })
      .notNull()
      .references(() => eventGuests.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    title: varchar("title", { length: 100 }),
    notes: text("notes"),
    bio: text("bio"),
    guestResponses: jsonb("guest_responses").notNull().default({}),
    customFields: jsonb("custom_fields").notNull().default({}),
    status: guestStatusEnum("status").notNull().default("pending"),
    attendanceStatus: attendanceStatusEnum("attendance_status"),
    seatNumber: varchar("seat_number", { length: 50 }),
    tableNumber: varchar("table_number", { length: 50 }),
    searchText: tsvector("search_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_guest_profiles_eg_idx").on(t.eventGuestId)]
);

// ─── Event Lists ──────────────────────────────────────────────────────────────

export const eventLists = eventsSchema.table(
  "event_lists",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    eventId: varchar("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    guestsCount: integer("guests_count").notNull().default(0),
    isProtected: boolean("is_protected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_lists_event_idx").on(t.eventId)]
);

// ─── Event List Members ───────────────────────────────────────────────────────

export const eventListMembers = eventsSchema.table(
  "event_list_members",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    listId: varchar("list_id", { length: 26 })
      .notNull()
      .references(() => eventLists.id, { onDelete: "cascade" }),
    guestId: varchar("guest_id", { length: 26 })
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_list_members_list_guest_idx").on(t.listId, t.guestId),
  ]
);

// ─── Event Forms ──────────────────────────────────────────────────────────────

export const eventForms = eventsSchema.table("event_forms", {
  id: varchar("id", { length: 26 }).primaryKey(),
  eventId: varchar("event_id", { length: 26 })
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Event Form Fields ────────────────────────────────────────────────────────

export const eventFormFields = eventsSchema.table(
  "event_form_fields",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    formId: varchar("form_id", { length: 26 })
      .notNull()
      .references(() => eventForms.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    kind: formFieldKindEnum("kind").notNull().default("text"),
    position: integer("position").notNull().default(0),
    content: text("content"),
    isRequired: boolean("is_required").notNull().default(false),
    description: text("description"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_form_fields_form_idx").on(t.formId)]
);

// ─── Guest Form Responses ─────────────────────────────────────────────────────

export const guestFormResponses = eventsSchema.table(
  "guest_form_responses",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    formId: varchar("form_id", { length: 26 })
      .notNull()
      .references(() => eventForms.id, { onDelete: "cascade" }),
    eventGuestId: varchar("event_guest_id", { length: 26 })
      .notNull()
      .references(() => eventGuests.id, { onDelete: "cascade" }),
    answers: jsonb("answers").notNull().default({}),
    metadata: jsonb("metadata").notNull().default({}),
    isAdditionalGuest: boolean("is_additional_guest").notNull().default(false),
    comment: text("comment"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("guest_form_responses_form_idx").on(t.formId),
    index("guest_form_responses_eg_idx").on(t.eventGuestId),
  ]
);

// ─── Event Pages ──────────────────────────────────────────────────────────────

export const eventPages = eventsSchema.table(
  "event_pages",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    eventId: varchar("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    status: pageStatusEnum("status").notNull().default("draft"),
    kind: pageKindEnum("kind").notNull().default("registration"),
    domainId: varchar("domain_id", { length: 26 }),
    templateId: varchar("template_id", { length: 26 }),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_pages_slug_idx").on(t.slug),
    index("event_pages_event_idx").on(t.eventId),
  ]
);

// ─── Event Key Dates ──────────────────────────────────────────────────────────

export const eventKeyDates = eventsSchema.table("event_key_dates", {
  id: varchar("id", { length: 26 }).primaryKey(),
  eventId: varchar("event_id", { length: 26 })
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Event Greeters ───────────────────────────────────────────────────────────

export const eventGreeters = eventsSchema.table(
  "event_greeters",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    eventId: varchar("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    token: varchar("token", { length: 40 }).notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_greeters_event_idx").on(t.eventId)]
);
