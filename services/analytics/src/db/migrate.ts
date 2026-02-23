import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS analytics`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS analytics.message_analytics_snapshots (
      id            INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      message_id    VARCHAR(26)  NOT NULL,
      account_id    VARCHAR(26)  NOT NULL,
      interval      INTEGER      NOT NULL DEFAULT 0,
      day           DATE         NOT NULL,
      channel       VARCHAR(30)  NOT NULL DEFAULT 'email',
      sends         INTEGER      NOT NULL DEFAULT 0,
      deliveries    INTEGER      NOT NULL DEFAULT 0,
      spam_reports  INTEGER      NOT NULL DEFAULT 0,
      bounces       INTEGER      NOT NULL DEFAULT 0,
      failures      INTEGER      NOT NULL DEFAULT 0,
      cancels       INTEGER      NOT NULL DEFAULT 0,
      opens         INTEGER      NOT NULL DEFAULT 0,
      total_opens   INTEGER      NOT NULL DEFAULT 0,
      clicks        INTEGER      NOT NULL DEFAULT 0,
      total_clicks  INTEGER      NOT NULL DEFAULT 0,
      unsubscribes  INTEGER      NOT NULL DEFAULT 0,
      contacts      INTEGER      NOT NULL DEFAULT 0,
      guests        INTEGER      NOT NULL DEFAULT 0,
      lists         INTEGER      NOT NULL DEFAULT 0,
      releases      INTEGER      NOT NULL DEFAULT 0,
      links         JSONB        NOT NULL DEFAULT '{}',
      details       JSONB,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshot_channel_message_day_interval
      ON analytics.message_analytics_snapshots (channel, message_id, day, interval)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_snapshot_account_id
      ON analytics.message_analytics_snapshots (account_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS analytics.activities (
      id               INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      account_id       VARCHAR(26)  NOT NULL,
      actor_id         VARCHAR(26),
      actor_type       VARCHAR(100),
      action           VARCHAR(100),
      relateable_id    VARCHAR(26),
      relateable_type  VARCHAR(100),
      details          JSONB,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_activity_account_id
      ON analytics.activities (account_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_activity_actor
      ON analytics.activities (actor_id, actor_type)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_activity_relateable
      ON analytics.activities (relateable_id, relateable_type)
  `);
}
