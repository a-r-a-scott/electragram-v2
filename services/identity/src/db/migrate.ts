import { sql } from "drizzle-orm";

import type { Db } from "./client.js";

/**
 * Creates the identity schema and all tables.
 * In production use drizzle-kit migrations; this is a convenience
 * helper for integration tests and local development.
 */
export async function runMigrations(db: Db): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS identity`);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE identity.user_role AS ENUM ('normal', 'admin', 'demo', 'super_admin');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
        CREATE TYPE identity.user_status AS ENUM ('active', 'inactive');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_kind') THEN
        CREATE TYPE identity.account_kind AS ENUM ('individual', 'organization', 'demo');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
        CREATE TYPE identity.account_status AS ENUM ('onboarding', 'active', 'archived', 'deleted');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_source') THEN
        CREATE TYPE identity.session_source AS ENUM ('signin', 'google_oauth2', 'signin_token', 'api');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS identity.users (
      id VARCHAR(26) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      password_digest VARCHAR(255),
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(50),
      time_zone VARCHAR(100) NOT NULL DEFAULT 'UTC',
      status identity.user_status NOT NULL DEFAULT 'active',
      role identity.user_role NOT NULL DEFAULT 'normal',
      avatar_checksum VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(email)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS identity.accounts (
      id VARCHAR(26) PRIMARY KEY,
      slug VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      kind identity.account_kind NOT NULL DEFAULT 'organization',
      status identity.account_status NOT NULL DEFAULT 'onboarding',
      time_zone VARCHAR(100) NOT NULL DEFAULT 'UTC',
      api_key VARCHAR(40) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(slug),
      UNIQUE(api_key)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS identity.account_users (
      id VARCHAR(26) PRIMARY KEY,
      user_id VARCHAR(26) NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
      account_id VARCHAR(26) NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
      is_owner BOOLEAN NOT NULL DEFAULT FALSE,
      role_id VARCHAR(26),
      time_zone VARCHAR(100) NOT NULL DEFAULT 'UTC',
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, account_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS identity.user_sessions (
      id VARCHAR(26) PRIMARY KEY,
      user_id VARCHAR(26) NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
      persistence_token VARCHAR(255) NOT NULL UNIQUE,
      ip_address VARCHAR(50),
      last_active_at TIMESTAMPTZ DEFAULT NOW(),
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      source identity.session_source NOT NULL DEFAULT 'signin',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS identity.user_authorizations (
      id VARCHAR(26) PRIMARY KEY,
      user_id VARCHAR(26) NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,
      external_key VARCHAR(255) NOT NULL,
      token TEXT,
      refresh_token TEXT,
      scopes TEXT[],
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider, external_key)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS identity.roles (
      id VARCHAR(26) PRIMARY KEY,
      account_id VARCHAR(26) NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      lookup_key VARCHAR(100) NOT NULL,
      permissions JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
