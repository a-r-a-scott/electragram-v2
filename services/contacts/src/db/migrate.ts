import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS contacts`);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'contacts')) THEN
        CREATE TYPE contacts.contact_status AS ENUM ('active','unsubscribed','archived','imported');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_list_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'contacts')) THEN
        CREATE TYPE contacts.contact_list_status AS ENUM ('active','archived');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_field_kind' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'contacts')) THEN
        CREATE TYPE contacts.contact_field_kind AS ENUM ('text','number','date','boolean','select','multi_select');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contacts.contacts (
      id VARCHAR(26) PRIMARY KEY,
      account_id VARCHAR(26) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      whatsapp VARCHAR(50),
      status contacts.contact_status NOT NULL DEFAULT 'active',
      source VARCHAR(100),
      custom_fields JSONB NOT NULL DEFAULT '{}',
      email_hash VARCHAR(64),
      dupe_key VARCHAR(255),
      avatar_checksum VARCHAR(255),
      search_text tsvector,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS contacts_account_idx ON contacts.contacts(account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS contacts_email_hash_idx ON contacts.contacts(account_id, email_hash)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS contacts_search_idx ON contacts.contacts USING gin(search_text)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contacts.contact_email_addresses (
      id VARCHAR(26) PRIMARY KEY,
      contact_id VARCHAR(26) NOT NULL REFERENCES contacts.contacts(id) ON DELETE CASCADE,
      account_id VARCHAR(26) NOT NULL,
      email VARCHAR(255) NOT NULL,
      kind VARCHAR(50) NOT NULL DEFAULT 'primary',
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      subscribed_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      unsubscribed_at TIMESTAMPTZ,
      description VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(account_id, email)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contacts.contact_phone_numbers (
      id VARCHAR(26) PRIMARY KEY,
      contact_id VARCHAR(26) NOT NULL REFERENCES contacts.contacts(id) ON DELETE CASCADE,
      account_id VARCHAR(26) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      kind VARCHAR(50) NOT NULL DEFAULT 'mobile',
      country_code VARCHAR(10),
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      has_sms BOOLEAN NOT NULL DEFAULT FALSE,
      has_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(account_id, phone)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contacts.contact_lists (
      id VARCHAR(26) PRIMARY KEY,
      account_id VARCHAR(26) NOT NULL,
      name VARCHAR(255) NOT NULL,
      status contacts.contact_list_status NOT NULL DEFAULT 'active',
      members_count INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      source VARCHAR(100),
      is_protected BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS contact_lists_account_idx ON contacts.contact_lists(account_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contacts.contact_list_members (
      id VARCHAR(26) PRIMARY KEY,
      contact_list_id VARCHAR(26) NOT NULL REFERENCES contacts.contact_lists(id) ON DELETE CASCADE,
      contact_id VARCHAR(26) NOT NULL REFERENCES contacts.contacts(id) ON DELETE CASCADE,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(contact_list_id, contact_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contacts.contact_fields (
      id VARCHAR(26) PRIMARY KEY,
      account_id VARCHAR(26) NOT NULL,
      event_id VARCHAR(26),
      name VARCHAR(100) NOT NULL,
      kind contacts.contact_field_kind NOT NULL DEFAULT 'text',
      position INTEGER NOT NULL DEFAULT 0,
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
