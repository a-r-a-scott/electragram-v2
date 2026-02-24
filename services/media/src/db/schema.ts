import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const mediaSchema = pgSchema("media");

export const uploadStatusEnum = pgEnum("upload_status", [
  "pending", "analyzing", "analyzed", "processing", "processed", "failed",
]);

export const exportStatusEnum = pgEnum("export_status", [
  "pending", "processing", "completed", "failed",
]);

/** Tracks a file upload job — CSV import, image, or attachment */
export const uploads = mediaSchema.table(
  "uploads",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    userId: varchar("user_id", { length: 26 }).notNull(),
    status: uploadStatusEnum("status").notNull().default("pending"),
    purpose: varchar("purpose", { length: 100 }),
    relateableId: varchar("relateable_id", { length: 26 }),
    relateableType: varchar("relateable_type", { length: 100 }),
    mapping: jsonb("mapping").$type<Record<string, string>>(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_upload_account").on(t.accountId),
    index("idx_upload_relateable").on(t.relateableType, t.relateableId),
  ],
);

/** Per-row errors recorded during CSV processing */
export const uploadErrors = mediaSchema.table(
  "upload_errors",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    uploadId: varchar("upload_id", { length: 26 }).notNull(),
    rowIndex: integer("row_index"),
    rowData: jsonb("row_data").$type<Record<string, unknown>>(),
    messages: jsonb("messages").$type<string[]>(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_upload_error_upload").on(t.uploadId),
  ],
);

/** Maps a processed CSV row to the internal record it created/updated */
export const uploadRefs = mediaSchema.table(
  "upload_refs",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    uploadId: varchar("upload_id", { length: 26 }).notNull(),
    recordType: varchar("record_type", { length: 100 }).notNull(),
    recordId: varchar("record_id", { length: 26 }).notNull(),
    created: boolean("created").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_upload_ref_upload").on(t.uploadId),
    index("idx_upload_ref_record").on(t.recordType, t.recordId),
  ],
);

/** Tracks a data export job — CSV, attendee list, etc. */
export const exports = mediaSchema.table(
  "exports",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    userId: varchar("user_id", { length: 26 }).notNull(),
    status: exportStatusEnum("status").notNull().default("pending"),
    label: varchar("label", { length: 255 }),
    exportType: varchar("export_type", { length: 100 }).notNull(),
    recordType: varchar("record_type", { length: 100 }),
    recordId: varchar("record_id", { length: 26 }),
    details: jsonb("details").$type<Record<string, unknown>>(),
    exportedAt: timestamp("exported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_export_account").on(t.accountId),
    index("idx_export_record").on(t.recordType, t.recordId),
  ],
);
