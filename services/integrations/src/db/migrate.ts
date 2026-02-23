import { sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { PROVIDER_CATALOG } from "../providers/catalog.js";
import { nanoid } from "nanoid";

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS integrations`);

  // Enums
  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE integrations.integration_status AS ENUM ('pending', 'active', 'error', 'disconnected');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE integrations.credential_status AS ENUM ('active', 'expired', 'revoked');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE integrations.provider_ref_status AS ENUM ('active', 'stale', 'deleted');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE integrations.spreadsheet_status AS ENUM ('pending', 'verified', 'error');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  // Tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS integrations.integrations (
      id          VARCHAR(26)   PRIMARY KEY,
      name        VARCHAR(100)  NOT NULL,
      key         VARCHAR(50)   NOT NULL,
      category    VARCHAR(50),
      auth_kind   VARCHAR(20)   NOT NULL DEFAULT 'oauth2',
      description TEXT,
      logo_url    VARCHAR(500),
      is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
      config      JSONB,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_key ON integrations.integrations (key)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS integrations.account_integrations (
      id              VARCHAR(26)   PRIMARY KEY,
      account_id      VARCHAR(26)   NOT NULL,
      integration_id  VARCHAR(26)   NOT NULL,
      credential_id   VARCHAR(26),
      status          integrations.integration_status NOT NULL DEFAULT 'pending',
      last_sync_at    TIMESTAMPTZ,
      last_sync_error TEXT,
      config          JSONB,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_account_integration_unique ON integrations.account_integrations (account_id, integration_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_account_integration_account ON integrations.account_integrations (account_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS integrations.credentials (
      id           VARCHAR(26)   PRIMARY KEY,
      account_id   VARCHAR(26)   NOT NULL,
      provider     VARCHAR(50)   NOT NULL,
      status       integrations.credential_status NOT NULL DEFAULT 'active',
      label        VARCHAR(255),
      external_key TEXT,
      expires_at   TIMESTAMPTZ,
      config       JSONB,
      secrets      TEXT,
      created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_credential_account ON integrations.credentials (account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_credential_account_provider ON integrations.credentials (account_id, status, provider)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS integrations.provider_refs (
      id            VARCHAR(26)   PRIMARY KEY,
      credential_id VARCHAR(26)   NOT NULL,
      provider      VARCHAR(50)   NOT NULL,
      external_key  VARCHAR(255)  NOT NULL,
      record_id     VARCHAR(26)   NOT NULL,
      record_type   VARCHAR(100)  NOT NULL,
      status        integrations.provider_ref_status NOT NULL DEFAULT 'active',
      kind          VARCHAR(50)   NOT NULL DEFAULT 'contact',
      details       JSONB,
      synced_at     TIMESTAMPTZ,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_ref_external_key ON integrations.provider_refs (provider, external_key, credential_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_provider_ref_credential ON integrations.provider_refs (credential_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_provider_ref_record ON integrations.provider_refs (record_id, record_type)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS integrations.spreadsheets (
      id               VARCHAR(26)   PRIMARY KEY,
      account_id       VARCHAR(26)   NOT NULL,
      provider         VARCHAR(50)   NOT NULL,
      name             VARCHAR(255),
      description      TEXT,
      status           integrations.spreadsheet_status NOT NULL DEFAULT 'pending',
      external_key     VARCHAR(255),
      mappings         JSONB,
      details          JSONB,
      credential_id    VARCHAR(26),
      attachable_type  VARCHAR(100),
      attachable_id    VARCHAR(26),
      verified_at      TIMESTAMPTZ,
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_spreadsheet_account ON integrations.spreadsheets (account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_spreadsheet_credential ON integrations.spreadsheets (credential_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_spreadsheet_attachable ON integrations.spreadsheets (attachable_type, attachable_id)`);

  // Seed provider catalog (idempotent)
  for (const provider of PROVIDER_CATALOG) {
    await db.execute(sql`
      INSERT INTO integrations.integrations (id, name, key, category, auth_kind, description, is_active)
      VALUES (${nanoid()}, ${provider.name}, ${provider.key}, ${provider.category}, ${provider.authKind}, ${provider.description}, TRUE)
      ON CONFLICT (key) DO NOTHING
    `);
  }
}
