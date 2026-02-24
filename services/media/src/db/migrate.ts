import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS media`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE media.upload_status AS ENUM ('pending', 'analyzing', 'analyzed', 'processing', 'processed', 'failed');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE media.export_status AS ENUM ('pending', 'processing', 'completed', 'failed');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media.uploads (
      id               VARCHAR(26)   PRIMARY KEY,
      account_id       VARCHAR(26)   NOT NULL,
      user_id          VARCHAR(26)   NOT NULL,
      status           media.upload_status NOT NULL DEFAULT 'pending',
      purpose          VARCHAR(100),
      relateable_id    VARCHAR(26),
      relateable_type  VARCHAR(100),
      mapping          JSONB,
      details          JSONB,
      analyzed_at      TIMESTAMPTZ,
      processed_at     TIMESTAMPTZ,
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_upload_account ON media.uploads (account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_upload_relateable ON media.uploads (relateable_type, relateable_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media.upload_errors (
      id          VARCHAR(26)   PRIMARY KEY,
      upload_id   VARCHAR(26)   NOT NULL,
      row_index   INTEGER,
      row_data    JSONB,
      messages    JSONB,
      details     JSONB,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_upload_error_upload ON media.upload_errors (upload_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media.upload_refs (
      id           VARCHAR(26)   PRIMARY KEY,
      upload_id    VARCHAR(26)   NOT NULL,
      record_type  VARCHAR(100)  NOT NULL,
      record_id    VARCHAR(26)   NOT NULL,
      created      BOOLEAN       NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_upload_ref_upload ON media.upload_refs (upload_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_upload_ref_record ON media.upload_refs (record_type, record_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media.exports (
      id           VARCHAR(26)   PRIMARY KEY,
      account_id   VARCHAR(26)   NOT NULL,
      user_id      VARCHAR(26)   NOT NULL,
      status       media.export_status NOT NULL DEFAULT 'pending',
      label        VARCHAR(255),
      export_type  VARCHAR(100)  NOT NULL,
      record_type  VARCHAR(100),
      record_id    VARCHAR(26),
      details      JSONB,
      exported_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_export_account ON media.exports (account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_export_record ON media.exports (record_type, record_id)`);
}
