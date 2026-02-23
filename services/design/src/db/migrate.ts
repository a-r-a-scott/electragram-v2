import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export async function runMigrations(db: Db): Promise<void> {
  // Create the design schema and all tables idempotently.
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS design`);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE design.design_status AS ENUM ('draft', 'active', 'archived');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE design.theme_kind AS ENUM ('invitation', 'email', 'event_page', 'general');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE design.template_kind AS ENUM ('invitation', 'email', 'event_page', 'rsvp_form', 'general');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE design.layer_kind AS ENUM ('background', 'foreground', 'overlay', 'text', 'graphic', 'border');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE design.layer_side AS ENUM ('front', 'back');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE design.font_kind AS ENUM ('system', 'google', 'custom');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE design.block_kind AS ENUM ('section', 'row', 'column', 'text', 'image', 'button', 'divider', 'spacer', 'form_field');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS design.color_palettes (
      id            VARCHAR(26) PRIMARY KEY,
      name          VARCHAR(255) NOT NULL,
      description   TEXT,
      "primary"     VARCHAR(20),
      secondary     VARCHAR(20),
      tertiary      VARCHAR(20),
      background_primary   VARCHAR(20),
      background_secondary VARCHAR(20),
      status        design.design_status NOT NULL DEFAULT 'active',
      shared        BOOLEAN NOT NULL DEFAULT true,
      position      INTEGER DEFAULT 0,
      lookup_key    VARCHAR(100) UNIQUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS design.fonts (
      id           VARCHAR(26) PRIMARY KEY,
      account_id   VARCHAR(26),
      name         VARCHAR(255) NOT NULL,
      description  TEXT,
      kind         design.font_kind NOT NULL DEFAULT 'system',
      external_key VARCHAR(255),
      details      JSONB NOT NULL DEFAULT '{}',
      status       design.design_status NOT NULL DEFAULT 'active',
      shared       BOOLEAN NOT NULL DEFAULT true,
      lookup_key   VARCHAR(100) UNIQUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS fonts_account_idx ON design.fonts (account_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS design.font_stacks (
      id                VARCHAR(26) PRIMARY KEY,
      name              VARCHAR(255) NOT NULL,
      description       TEXT,
      primary_font_id   VARCHAR(26) NOT NULL,
      secondary_font_id VARCHAR(26),
      tertiary_font_id  VARCHAR(26),
      details           JSONB NOT NULL DEFAULT '{}',
      status            design.design_status NOT NULL DEFAULT 'active',
      shared            BOOLEAN NOT NULL DEFAULT true,
      position          INTEGER DEFAULT 0,
      lookup_key        VARCHAR(100) UNIQUE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS design.graphics (
      id             VARCHAR(26) PRIMARY KEY,
      name           VARCHAR(255) NOT NULL,
      description    TEXT,
      svg_background TEXT,
      svg_checksum   VARCHAR(64),
      svg_colors     JSONB NOT NULL DEFAULT '[]',
      details        JSONB NOT NULL DEFAULT '{}',
      status         design.design_status NOT NULL DEFAULT 'active',
      shared         BOOLEAN NOT NULL DEFAULT false,
      position       INTEGER DEFAULT 0,
      lookup_key     VARCHAR(100) UNIQUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS design.themes (
      id               VARCHAR(26) PRIMARY KEY,
      account_id       VARCHAR(26),
      name             VARCHAR(255) NOT NULL,
      title            VARCHAR(255),
      description      TEXT,
      kind             design.theme_kind NOT NULL DEFAULT 'invitation',
      status           design.design_status NOT NULL DEFAULT 'draft',
      shared           BOOLEAN NOT NULL DEFAULT true,
      customized       BOOLEAN NOT NULL DEFAULT false,
      locked           BOOLEAN NOT NULL DEFAULT false,
      color_palette_id VARCHAR(26),
      font_stack_id    VARCHAR(26),
      details          JSONB NOT NULL DEFAULT '{}',
      dimensions       JSONB NOT NULL DEFAULT '[1400, 1400]',
      position         INTEGER DEFAULT 0,
      lookup_key       VARCHAR(100) UNIQUE,
      search_text      TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      ) STORED,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS themes_account_idx ON design.themes (account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS themes_kind_idx ON design.themes (kind)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS themes_search_idx ON design.themes USING GIN (search_text)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS design.theme_templates (
      id           VARCHAR(26) PRIMARY KEY,
      theme_id     VARCHAR(26) NOT NULL,
      name         VARCHAR(255) NOT NULL,
      description  TEXT,
      kind         design.template_kind NOT NULL DEFAULT 'email',
      status       design.design_status NOT NULL DEFAULT 'draft',
      position     INTEGER DEFAULT 0,
      subject      VARCHAR(500),
      preheader    VARCHAR(255),
      body_html    TEXT,
      body_text    TEXT,
      from_name    VARCHAR(255),
      from_email   VARCHAR(255),
      variable_keys JSONB NOT NULL DEFAULT '[]',
      details      JSONB NOT NULL DEFAULT '{}',
      lookup_key   VARCHAR(100),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (theme_id, lookup_key)
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS theme_templates_theme_idx ON design.theme_templates (theme_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS theme_templates_kind_idx ON design.theme_templates (kind)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS design.theme_layers (
      id                  VARCHAR(26) PRIMARY KEY,
      theme_template_id   VARCHAR(26) NOT NULL,
      name                VARCHAR(255),
      kind                design.layer_kind NOT NULL DEFAULT 'background',
      side                design.layer_side NOT NULL DEFAULT 'front',
      position            INTEGER DEFAULT 0,
      svg_background      TEXT,
      svg_checksum        VARCHAR(64),
      svg_colors          JSONB NOT NULL DEFAULT '[]',
      dimensions          JSONB,
      coordinates         JSONB,
      details             JSONB NOT NULL DEFAULT '{}',
      lookup_key          VARCHAR(100),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (theme_template_id, lookup_key)
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS theme_layers_template_idx ON design.theme_layers (theme_template_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS design.blocks (
      id             VARCHAR(26) PRIMARY KEY,
      blockable_type VARCHAR(100) NOT NULL,
      blockable_id   VARCHAR(26) NOT NULL,
      parent_id      VARCHAR(26),
      kind           design.block_kind NOT NULL DEFAULT 'section',
      name           VARCHAR(255),
      style          VARCHAR(255) NOT NULL DEFAULT 'default',
      position       INTEGER NOT NULL DEFAULT 0,
      visible        BOOLEAN NOT NULL DEFAULT true,
      details        JSONB NOT NULL DEFAULT '{}',
      field_type     VARCHAR(50),
      required       BOOLEAN NOT NULL DEFAULT false,
      placeholder    VARCHAR(255) DEFAULT '',
      lookup_key     VARCHAR(100),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS blocks_blockable_idx ON design.blocks (blockable_type, blockable_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS blocks_parent_idx ON design.blocks (parent_id)`);
}
