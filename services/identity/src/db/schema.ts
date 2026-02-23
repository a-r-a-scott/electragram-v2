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

export const identitySchema = pgSchema("identity");

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "normal",
  "admin",
  "demo",
  "super_admin",
]);

export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);

export const accountKindEnum = pgEnum("account_kind", [
  "individual",
  "organization",
  "demo",
]);

export const accountStatusEnum = pgEnum("account_status", [
  "onboarding",
  "active",
  "archived",
  "deleted",
]);

export const sessionSourceEnum = pgEnum("session_source", [
  "signin",
  "google_oauth2",
  "signin_token",
  "api",
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = identitySchema.table(
  "users",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordDigest: varchar("password_digest", { length: 255 }),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 50 }),
    timeZone: varchar("time_zone", { length: 100 }).notNull().default("UTC"),
    status: userStatusEnum("status").notNull().default("active"),
    role: userRoleEnum("role").notNull().default("normal"),
    avatarChecksum: varchar("avatar_checksum", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
);

// ─── User Sessions ────────────────────────────────────────────────────────────

export const userSessions = identitySchema.table("user_sessions", {
  id: varchar("id", { length: 26 }).primaryKey(),
  userId: varchar("user_id", { length: 26 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  persistenceToken: varchar("persistence_token", { length: 255 })
    .notNull()
    .unique(),
  ipAddress: varchar("ip_address", { length: 50 }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  revoked: boolean("revoked").notNull().default(false),
  source: sessionSourceEnum("source").notNull().default("signin"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── User Authorizations (OAuth) ─────────────────────────────────────────────

export const userAuthorizations = identitySchema.table(
  "user_authorizations",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(),
    externalKey: varchar("external_key", { length: 255 }).notNull(),
    token: text("token"),
    refreshToken: text("refresh_token"),
    scopes: text("scopes").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_auths_provider_key_idx").on(t.provider, t.externalKey),
  ]
);

// ─── Accounts ─────────────────────────────────────────────────────────────────

export const accounts = identitySchema.table(
  "accounts",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    kind: accountKindEnum("kind").notNull().default("organization"),
    status: accountStatusEnum("status").notNull().default("onboarding"),
    timeZone: varchar("time_zone", { length: 100 }).notNull().default("UTC"),
    apiKey: varchar("api_key", { length: 40 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("accounts_slug_idx").on(t.slug)]
);

// ─── Account Users ────────────────────────────────────────────────────────────

export const accountUsers = identitySchema.table(
  "account_users",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 26 })
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    isOwner: boolean("is_owner").notNull().default(false),
    roleId: varchar("role_id", { length: 26 }),
    timeZone: varchar("time_zone", { length: 100 }).notNull().default("UTC"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("account_users_user_account_idx").on(t.userId, t.accountId),
    index("account_users_account_idx").on(t.accountId),
  ]
);

// ─── Roles ────────────────────────────────────────────────────────────────────

export const roles = identitySchema.table("roles", {
  id: varchar("id", { length: 26 }).primaryKey(),
  accountId: varchar("account_id", { length: 26 })
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  lookupKey: varchar("lookup_key", { length: 100 }).notNull(),
  permissions: jsonb("permissions").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
