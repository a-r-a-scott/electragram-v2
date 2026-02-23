import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS chat`);

  // Enums
  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE chat.conversation_status AS ENUM ('open', 'resolved', 'opted_out');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE chat.message_direction AS ENUM ('inbound', 'outbound');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE chat.message_status AS ENUM ('pending', 'sent', 'delivered', 'failed');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE chat.source_status AS ENUM ('active', 'inactive');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE chat.contactable_status AS ENUM ('active', 'opted_out');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  // Tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat.chat_sources (
      id              VARCHAR(26)   PRIMARY KEY,
      status          chat.source_status NOT NULL DEFAULT 'active',
      channel         VARCHAR(20)   NOT NULL,
      provider        VARCHAR(30)   NOT NULL DEFAULT 'twilio',
      handle          VARCHAR(100)  NOT NULL,
      account_id      VARCHAR(26)   NOT NULL,
      credential_id   VARCHAR(26),
      details         JSONB,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_source_channel_handle ON chat.chat_sources (channel, handle)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_source_account ON chat.chat_sources (account_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat.chat_identities (
      id            VARCHAR(26)   PRIMARY KEY,
      handle        VARCHAR(100),
      account_id    VARCHAR(26)   NOT NULL,
      channel       VARCHAR(20)   NOT NULL,
      opted_in_at   TIMESTAMPTZ,
      opted_out_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_identity_account ON chat.chat_identities (account_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat.chat_identity_contactables (
      id                VARCHAR(26)   PRIMARY KEY,
      contactable_type  VARCHAR(100)  NOT NULL,
      contactable_id    VARCHAR(26)   NOT NULL,
      identity_id       VARCHAR(26)   NOT NULL,
      status            chat.contactable_status NOT NULL DEFAULT 'active',
      created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_identity_contactable_type ON chat.chat_identity_contactables (contactable_type, contactable_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_identity_contactable_identity ON chat.chat_identity_contactables (identity_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat.chat_conversations (
      id                  VARCHAR(26)   PRIMARY KEY,
      status              chat.conversation_status NOT NULL DEFAULT 'open',
      account_id          VARCHAR(26)   NOT NULL,
      source_id           VARCHAR(26)   NOT NULL,
      channel             VARCHAR(20)   NOT NULL,
      provider            VARCHAR(30)   NOT NULL DEFAULT 'twilio',
      handle              VARCHAR(100)  NOT NULL,
      identity_id         VARCHAR(26),
      unread_at           TIMESTAMPTZ,
      last_message_at     TIMESTAMPTZ,
      search_text         TEXT,
      search_text_tsv     TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(search_text, '')), 'A')
      ) STORED,
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_conv_account ON chat.chat_conversations (account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_conv_source ON chat.chat_conversations (source_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_conv_identity ON chat.chat_conversations (identity_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_conv_last_message ON chat.chat_conversations (last_message_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_conv_unread ON chat.chat_conversations (unread_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_conv_search ON chat.chat_conversations USING gin(search_text_tsv)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat.chat_messages (
      id                    VARCHAR(26)   PRIMARY KEY,
      direction             chat.message_direction NOT NULL DEFAULT 'inbound',
      status                chat.message_status    NOT NULL DEFAULT 'pending',
      content               TEXT,
      external_message_key  VARCHAR(100),
      conversation_id       VARCHAR(26)   NOT NULL,
      media_urls            VARCHAR(500)[] NOT NULL DEFAULT '{}',
      created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_message_conversation ON chat.chat_messages (conversation_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat.chats (
      id                VARCHAR(26)   PRIMARY KEY,
      name              VARCHAR(255),
      kind              INTEGER       NOT NULL DEFAULT 0,
      account_id        VARCHAR(26)   NOT NULL,
      unread_at         TIMESTAMPTZ,
      source_message_id VARCHAR(26),
      created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chats_account ON chat.chats (account_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat.chat_groups (
      id          VARCHAR(26)   PRIMARY KEY,
      name        VARCHAR(255),
      kind        INTEGER,
      account_id  VARCHAR(26)   NOT NULL,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_group_account ON chat.chat_groups (account_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat.chat_memberships (
      id               VARCHAR(26)  PRIMARY KEY,
      chat_id          VARCHAR(26)  NOT NULL,
      conversation_id  VARCHAR(26)  NOT NULL,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_membership_chat ON chat.chat_memberships (chat_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_membership_conv ON chat.chat_memberships (conversation_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat.chat_threads (
      id                VARCHAR(26)   PRIMARY KEY,
      status            chat.conversation_status NOT NULL DEFAULT 'open',
      account_id        VARCHAR(26)   NOT NULL,
      source_id         VARCHAR(26)   NOT NULL,
      channel           VARCHAR(20)   NOT NULL,
      provider          VARCHAR(30)   NOT NULL DEFAULT 'twilio',
      handle            VARCHAR(100)  NOT NULL,
      contactable_type  VARCHAR(100)  NOT NULL,
      contactable_id    VARCHAR(26)   NOT NULL,
      chat_group_id     VARCHAR(26),
      opted_in_at       TIMESTAMPTZ,
      opted_out_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_thread_source_handle ON chat.chat_threads (source_id, handle)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_thread_account ON chat.chat_threads (account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_thread_contactable ON chat.chat_threads (contactable_type, contactable_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_thread_group ON chat.chat_threads (chat_group_id)`);
}
