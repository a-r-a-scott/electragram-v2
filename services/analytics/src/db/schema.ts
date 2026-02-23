import {
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const analyticsSchema = pgSchema("analytics");

export const messageAnalyticsSnapshots = analyticsSchema.table(
  "message_analytics_snapshots",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    messageId: varchar("message_id", { length: 26 }).notNull(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    interval: integer("interval").notNull().default(0),
    day: date("day").notNull(),
    channel: varchar("channel", { length: 30 }).notNull().default("email"),
    sends: integer("sends").notNull().default(0),
    deliveries: integer("deliveries").notNull().default(0),
    spamReports: integer("spam_reports").notNull().default(0),
    bounces: integer("bounces").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    cancels: integer("cancels").notNull().default(0),
    opens: integer("opens").notNull().default(0),
    totalOpens: integer("total_opens").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    totalClicks: integer("total_clicks").notNull().default(0),
    unsubscribes: integer("unsubscribes").notNull().default(0),
    contacts: integer("contacts").notNull().default(0),
    guests: integer("guests").notNull().default(0),
    lists: integer("lists").notNull().default(0),
    releases: integer("releases").notNull().default(0),
    links: jsonb("links").$type<Record<string, number>>().notNull().default({}),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_snapshot_channel_message_day_interval").on(t.channel, t.messageId, t.day, t.interval),
    index("idx_snapshot_account_id").on(t.accountId),
  ],
);

export const activities = analyticsSchema.table(
  "activities",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    actorId: varchar("actor_id", { length: 26 }),
    actorType: varchar("actor_type", { length: 100 }),
    action: varchar("action", { length: 100 }),
    relateableId: varchar("relateable_id", { length: 26 }),
    relateableType: varchar("relateable_type", { length: 100 }),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_activity_account_id").on(t.accountId),
    index("idx_activity_actor").on(t.actorId, t.actorType),
    index("idx_activity_relateable").on(t.relateableId, t.relateableType),
  ],
);
