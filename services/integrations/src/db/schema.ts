import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const integrationsSchema = pgSchema("integrations");

// Enums
export const integrationStatusEnum = pgEnum("integration_status", [
  "pending", "active", "error", "disconnected",
]);

export const credentialStatusEnum = pgEnum("credential_status", [
  "active", "expired", "revoked",
]);

export const providerRefStatusEnum = pgEnum("provider_ref_status", [
  "active", "stale", "deleted",
]);

export const spreadsheetStatusEnum = pgEnum("spreadsheet_status", [
  "pending", "verified", "error",
]);

/**
 * Provider catalog — one row per supported integration (HubSpot, Mailchimp, etc.)
 * Seeded at startup; not created by end users.
 */
export const integrations = integrationsSchema.table(
  "integrations",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    key: varchar("key", { length: 50 }).notNull(),
    category: varchar("category", { length: 50 }),
    authKind: varchar("auth_kind", { length: 20 }).notNull().default("oauth2"),
    description: text("description"),
    logoUrl: varchar("logo_url", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    config: jsonb("config").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_integration_key").on(t.key),
  ],
);

/** Per-account connection state for a given provider */
export const accountIntegrations = integrationsSchema.table(
  "account_integrations",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    integrationId: varchar("integration_id", { length: 26 }).notNull(),
    credentialId: varchar("credential_id", { length: 26 }),
    status: integrationStatusEnum("status").notNull().default("pending"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    config: jsonb("config").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_account_integration_unique").on(t.accountId, t.integrationId),
    index("idx_account_integration_account").on(t.accountId),
  ],
);

/** OAuth tokens and API keys — secrets field is AES-256-GCM encrypted */
export const credentials = integrationsSchema.table(
  "credentials",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    status: credentialStatusEnum("status").notNull().default("active"),
    label: varchar("label", { length: 255 }),
    externalKey: text("external_key"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    config: jsonb("config").$type<Record<string, unknown>>(),
    secrets: text("secrets"), // AES-256-GCM encrypted JSON
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_credential_account").on(t.accountId),
    index("idx_credential_account_provider").on(t.accountId, t.status, t.provider),
  ],
);

/** Maps an internal record (Contact, List) to its external CRM ID */
export const providerRefs = integrationsSchema.table(
  "provider_refs",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    credentialId: varchar("credential_id", { length: 26 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    externalKey: varchar("external_key", { length: 255 }).notNull(),
    recordId: varchar("record_id", { length: 26 }).notNull(),
    recordType: varchar("record_type", { length: 100 }).notNull(),
    status: providerRefStatusEnum("status").notNull().default("active"),
    kind: varchar("kind", { length: 50 }).notNull().default("contact"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_provider_ref_external_key").on(t.provider, t.externalKey, t.credentialId),
    index("idx_provider_ref_credential").on(t.credentialId),
    index("idx_provider_ref_record").on(t.recordId, t.recordType),
  ],
);

/** Google Sheets / CSV file connections with column mappings */
export const spreadsheets = integrationsSchema.table(
  "spreadsheets",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }),
    description: text("description"),
    status: spreadsheetStatusEnum("status").notNull().default("pending"),
    externalKey: varchar("external_key", { length: 255 }),
    mappings: jsonb("mappings").$type<Record<string, string>>(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    credentialId: varchar("credential_id", { length: 26 }),
    attachableType: varchar("attachable_type", { length: 100 }),
    attachableId: varchar("attachable_id", { length: 26 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_spreadsheet_account").on(t.accountId),
    index("idx_spreadsheet_credential").on(t.credentialId),
    index("idx_spreadsheet_attachable").on(t.attachableType, t.attachableId),
  ],
);
