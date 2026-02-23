import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS messaging`);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'messaging')) THEN
        CREATE TYPE messaging.message_status AS ENUM ('draft','scheduled','sending','sent','paused','cancelled','failed');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_kind' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'messaging')) THEN
        CREATE TYPE messaging.message_kind AS ENUM ('email','sms','whatsapp');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_trigger_kind' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'messaging')) THEN
        CREATE TYPE messaging.message_trigger_kind AS ENUM ('manual','scheduled','event_trigger','rsvp_trigger','date_trigger');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recipient_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'messaging')) THEN
        CREATE TYPE messaging.recipient_status AS ENUM ('pending','queued','delivered','failed','bounced','unsubscribed','skipped');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'messaging')) THEN
        CREATE TYPE messaging.template_status AS ENUM ('draft','active','archived');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messaging.message_templates (
      id VARCHAR(26) PRIMARY KEY,
      account_id VARCHAR(26) NOT NULL,
      name VARCHAR(255) NOT NULL,
      kind messaging.message_kind NOT NULL DEFAULT 'email',
      subject VARCHAR(500),
      body TEXT NOT NULL DEFAULT '',
      body_html TEXT,
      from_name VARCHAR(255),
      from_email VARCHAR(255),
      reply_to VARCHAR(255),
      status messaging.template_status NOT NULL DEFAULT 'draft',
      variable_keys JSONB NOT NULL DEFAULT '[]',
      search_text TSVECTOR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS msg_templates_account_idx ON messaging.message_templates (account_id);
    CREATE INDEX IF NOT EXISTS msg_templates_search_idx ON messaging.message_templates USING GIN (search_text);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messaging.messages (
      id VARCHAR(26) PRIMARY KEY,
      account_id VARCHAR(26) NOT NULL,
      event_id VARCHAR(26),
      template_id VARCHAR(26),
      name VARCHAR(255) NOT NULL,
      kind messaging.message_kind NOT NULL DEFAULT 'email',
      subject VARCHAR(500),
      body TEXT NOT NULL DEFAULT '',
      body_html TEXT,
      from_name VARCHAR(255),
      from_email VARCHAR(255),
      reply_to VARCHAR(255),
      status messaging.message_status NOT NULL DEFAULT 'draft',
      trigger_kind messaging.message_trigger_kind NOT NULL DEFAULT 'manual',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      bounced_count INTEGER NOT NULL DEFAULT 0,
      open_count INTEGER NOT NULL DEFAULT 0,
      click_count INTEGER NOT NULL DEFAULT 0,
      unsubscribe_count INTEGER NOT NULL DEFAULT 0,
      trigger_config JSONB NOT NULL DEFAULT '{}',
      search_text TSVECTOR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS messages_account_idx ON messaging.messages (account_id);
    CREATE INDEX IF NOT EXISTS messages_event_idx ON messaging.messages (event_id);
    CREATE INDEX IF NOT EXISTS messages_status_idx ON messaging.messages (status);
    CREATE INDEX IF NOT EXISTS messages_scheduled_idx ON messaging.messages (scheduled_at);
    CREATE INDEX IF NOT EXISTS messages_search_idx ON messaging.messages USING GIN (search_text);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messaging.message_recipients (
      id VARCHAR(26) PRIMARY KEY,
      message_id VARCHAR(26) NOT NULL REFERENCES messaging.messages(id) ON DELETE CASCADE,
      account_id VARCHAR(26) NOT NULL,
      guest_id VARCHAR(26),
      email VARCHAR(255),
      phone VARCHAR(50),
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      status messaging.recipient_status NOT NULL DEFAULT 'pending',
      external_id VARCHAR(255),
      failure_reason TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      queued_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS msg_recipients_message_idx ON messaging.message_recipients (message_id);
    CREATE INDEX IF NOT EXISTS msg_recipients_guest_idx ON messaging.message_recipients (guest_id);
    CREATE INDEX IF NOT EXISTS msg_recipients_status_idx ON messaging.message_recipients (message_id, status);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messaging.message_recipient_lists (
      id VARCHAR(26) PRIMARY KEY,
      message_id VARCHAR(26) NOT NULL REFERENCES messaging.messages(id) ON DELETE CASCADE,
      list_id VARCHAR(26) NOT NULL,
      list_kind VARCHAR(50) NOT NULL DEFAULT 'event_list',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS msg_recipient_lists_msg_idx ON messaging.message_recipient_lists (message_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messaging.unsubscribes (
      id VARCHAR(26) PRIMARY KEY,
      account_id VARCHAR(26) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      guest_id VARCHAR(26),
      message_id VARCHAR(26),
      reason VARCHAR(255),
      is_global BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS unsubscribes_account_email_idx ON messaging.unsubscribes (account_id, email);
    CREATE INDEX IF NOT EXISTS unsubscribes_guest_idx ON messaging.unsubscribes (guest_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messaging.dispatch_jobs (
      id VARCHAR(26) PRIMARY KEY,
      message_id VARCHAR(26) NOT NULL REFERENCES messaging.messages(id) ON DELETE CASCADE,
      recipient_id VARCHAR(26) NOT NULL REFERENCES messaging.message_recipients(id) ON DELETE CASCADE,
      sqs_message_id VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispatch_jobs_message_idx ON messaging.dispatch_jobs (message_id);
    CREATE INDEX IF NOT EXISTS dispatch_jobs_status_idx ON messaging.dispatch_jobs (status);
  `);
}
