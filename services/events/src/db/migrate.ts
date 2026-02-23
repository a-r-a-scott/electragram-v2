import { sql } from "drizzle-orm";

import type { Db } from "./client.js";

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS events`);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'events')) THEN
        CREATE TYPE events.event_status AS ENUM ('active', 'archived');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'guest_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'events')) THEN
        CREATE TYPE events.guest_status AS ENUM ('pending','invited','accepted','declined','archived','registered','unsubscribed');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'events')) THEN
        CREATE TYPE events.attendance_status AS ENUM ('attending','not_attending','maybe');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'form_field_kind' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'events')) THEN
        CREATE TYPE events.form_field_kind AS ENUM ('text','textarea','email','phone','select','multi_select','checkbox','date','number');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'page_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'events')) THEN
        CREATE TYPE events.page_status AS ENUM ('draft','active','archived');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'page_kind' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'events')) THEN
        CREATE TYPE events.page_kind AS ENUM ('registration','information','confirmation');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.events (
      id VARCHAR(26) PRIMARY KEY,
      account_id VARCHAR(26) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      status events.event_status NOT NULL DEFAULT 'active',
      guests_count INTEGER NOT NULL DEFAULT 0,
      lists_count INTEGER NOT NULL DEFAULT 0,
      capacity_max INTEGER,
      capacity_count INTEGER NOT NULL DEFAULT 0,
      is_open BOOLEAN NOT NULL DEFAULT TRUE,
      ability_to_add_attendee BOOLEAN NOT NULL DEFAULT TRUE,
      search_text TSVECTOR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS events_account_idx ON events.events (account_id);
    CREATE INDEX IF NOT EXISTS events_search_idx ON events.events USING GIN (search_text);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.guests (
      id VARCHAR(26) PRIMARY KEY,
      account_id VARCHAR(26) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      whatsapp VARCHAR(50),
      preferred_channel VARCHAR(20) DEFAULT 'email',
      email_optin BOOLEAN NOT NULL DEFAULT TRUE,
      custom_fields JSONB NOT NULL DEFAULT '{}',
      email_hash VARCHAR(64),
      dupe_key VARCHAR(255),
      avatar_checksum VARCHAR(255),
      search_text TSVECTOR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS guests_account_idx ON events.guests (account_id);
    CREATE INDEX IF NOT EXISTS guests_email_hash_idx ON events.guests (account_id, email_hash);
    CREATE INDEX IF NOT EXISTS guests_search_idx ON events.guests USING GIN (search_text);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.event_guests (
      id VARCHAR(26) PRIMARY KEY,
      event_id VARCHAR(26) NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
      guest_id VARCHAR(26) NOT NULL REFERENCES events.guests(id) ON DELETE CASCADE,
      account_id VARCHAR(26) NOT NULL,
      status events.guest_status NOT NULL DEFAULT 'pending',
      has_responded BOOLEAN NOT NULL DEFAULT FALSE,
      attendance_status events.attendance_status,
      checked_in_at TIMESTAMPTZ,
      seat_number VARCHAR(50),
      table_number VARCHAR(50),
      event_message_settings JSONB NOT NULL DEFAULT '{}',
      attendees_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(event_id, guest_id)
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS event_guests_event_idx ON events.event_guests (event_id);
    CREATE INDEX IF NOT EXISTS event_guests_guest_idx ON events.event_guests (guest_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.event_guest_profiles (
      id VARCHAR(26) PRIMARY KEY,
      event_guest_id VARCHAR(26) NOT NULL REFERENCES events.event_guests(id) ON DELETE CASCADE,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      title VARCHAR(100),
      notes TEXT,
      bio TEXT,
      guest_responses JSONB NOT NULL DEFAULT '{}',
      custom_fields JSONB NOT NULL DEFAULT '{}',
      status events.guest_status NOT NULL DEFAULT 'pending',
      attendance_status events.attendance_status,
      seat_number VARCHAR(50),
      table_number VARCHAR(50),
      search_text TSVECTOR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.event_lists (
      id VARCHAR(26) PRIMARY KEY,
      event_id VARCHAR(26) NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      guests_count INTEGER NOT NULL DEFAULT 0,
      is_protected BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.event_list_members (
      id VARCHAR(26) PRIMARY KEY,
      list_id VARCHAR(26) NOT NULL REFERENCES events.event_lists(id) ON DELETE CASCADE,
      guest_id VARCHAR(26) NOT NULL REFERENCES events.guests(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(list_id, guest_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.event_forms (
      id VARCHAR(26) PRIMARY KEY,
      event_id VARCHAR(26) NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.event_form_fields (
      id VARCHAR(26) PRIMARY KEY,
      form_id VARCHAR(26) NOT NULL REFERENCES events.event_forms(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      kind events.form_field_kind NOT NULL DEFAULT 'text',
      position INTEGER NOT NULL DEFAULT 0,
      content TEXT,
      is_required BOOLEAN NOT NULL DEFAULT FALSE,
      description TEXT,
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.guest_form_responses (
      id VARCHAR(26) PRIMARY KEY,
      form_id VARCHAR(26) NOT NULL REFERENCES events.event_forms(id) ON DELETE CASCADE,
      event_guest_id VARCHAR(26) NOT NULL REFERENCES events.event_guests(id) ON DELETE CASCADE,
      answers JSONB NOT NULL DEFAULT '{}',
      metadata JSONB NOT NULL DEFAULT '{}',
      is_additional_guest BOOLEAN NOT NULL DEFAULT FALSE,
      comment TEXT,
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.event_pages (
      id VARCHAR(26) PRIMARY KEY,
      event_id VARCHAR(26) NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      status events.page_status NOT NULL DEFAULT 'draft',
      kind events.page_kind NOT NULL DEFAULT 'registration',
      domain_id VARCHAR(26),
      template_id VARCHAR(26),
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.event_key_dates (
      id VARCHAR(26) PRIMARY KEY,
      event_id VARCHAR(26) NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      date TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events.event_greeters (
      id VARCHAR(26) PRIMARY KEY,
      event_id VARCHAR(26) NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      token VARCHAR(40) NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
