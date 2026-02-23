import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "../db/client.js";
import { accountIntegrations, integrations } from "../db/schema.js";
import { NotFoundError } from "./errors.js";

export interface AccountIntegrationRow {
  id: string;
  accountId: string;
  integrationId: string;
  credentialId: string | null;
  status: string;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  config: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountIntegrationWithProvider extends AccountIntegrationRow {
  integration: {
    id: string;
    name: string;
    key: string;
    category: string | null;
    authKind: string;
  };
}

export class AccountIntegrationsService {
  constructor(private readonly db: Db) {}

  async list(accountId: string): Promise<AccountIntegrationWithProvider[]> {
    const rows = await this.db
      .select({
        id: accountIntegrations.id,
        accountId: accountIntegrations.accountId,
        integrationId: accountIntegrations.integrationId,
        credentialId: accountIntegrations.credentialId,
        status: accountIntegrations.status,
        lastSyncAt: accountIntegrations.lastSyncAt,
        lastSyncError: accountIntegrations.lastSyncError,
        config: accountIntegrations.config,
        createdAt: accountIntegrations.createdAt,
        updatedAt: accountIntegrations.updatedAt,
        integrationName: integrations.name,
        integrationKey: integrations.key,
        integrationCategory: integrations.category,
        integrationAuthKind: integrations.authKind,
      })
      .from(accountIntegrations)
      .leftJoin(integrations, eq(accountIntegrations.integrationId, integrations.id))
      .where(eq(accountIntegrations.accountId, accountId));

    return rows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      integrationId: r.integrationId,
      credentialId: r.credentialId,
      status: r.status,
      lastSyncAt: r.lastSyncAt,
      lastSyncError: r.lastSyncError,
      config: r.config,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      integration: {
        id: r.integrationId,
        name: r.integrationName ?? "",
        key: r.integrationKey ?? "",
        category: r.integrationCategory,
        authKind: r.integrationAuthKind ?? "oauth2",
      },
    })) as unknown as AccountIntegrationWithProvider[];
  }

  async getById(id: string, accountId: string): Promise<AccountIntegrationRow> {
    const [row] = await this.db
      .select()
      .from(accountIntegrations)
      .where(and(eq(accountIntegrations.id, id), eq(accountIntegrations.accountId, accountId)));
    if (!row) throw new NotFoundError(`Account integration ${id} not found`);
    return row as unknown as AccountIntegrationRow;
  }

  async findByProvider(accountId: string, integrationKey: string): Promise<AccountIntegrationRow | null> {
    const rows = await this.db
      .select({
        ai: accountIntegrations,
      })
      .from(accountIntegrations)
      .leftJoin(integrations, eq(accountIntegrations.integrationId, integrations.id))
      .where(
        and(
          eq(accountIntegrations.accountId, accountId),
          eq(integrations.key, integrationKey),
        ),
      );
    return (rows[0]?.ai as unknown as AccountIntegrationRow) ?? null;
  }

  /** Create or update an account integration (upsert semantics) */
  async connect(params: {
    accountId: string;
    integrationId: string;
    credentialId: string;
  }): Promise<AccountIntegrationRow> {
    // Check if already connected
    const [existing] = await this.db
      .select()
      .from(accountIntegrations)
      .where(
        and(
          eq(accountIntegrations.accountId, params.accountId),
          eq(accountIntegrations.integrationId, params.integrationId),
        ),
      );

    if (existing) {
      const [updated] = await this.db
        .update(accountIntegrations)
        .set({
          credentialId: params.credentialId,
          status: "active",
          lastSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(accountIntegrations.id, existing.id))
        .returning();
      return updated as unknown as AccountIntegrationRow;
    }

    const [row] = await this.db
      .insert(accountIntegrations)
      .values({
        id: nanoid(),
        accountId: params.accountId,
        integrationId: params.integrationId,
        credentialId: params.credentialId,
        status: "active",
      })
      .returning();
    return row as unknown as AccountIntegrationRow;
  }

  async disconnect(id: string, accountId: string): Promise<void> {
    await this.getById(id, accountId);
    await this.db
      .update(accountIntegrations)
      .set({ status: "disconnected", credentialId: null, updatedAt: new Date() })
      .where(and(eq(accountIntegrations.id, id), eq(accountIntegrations.accountId, accountId)));
  }

  async markSyncComplete(id: string): Promise<void> {
    await this.db
      .update(accountIntegrations)
      .set({ lastSyncAt: new Date(), lastSyncError: null, updatedAt: new Date() })
      .where(eq(accountIntegrations.id, id));
  }

  async markSyncError(id: string, error: string): Promise<void> {
    await this.db
      .update(accountIntegrations)
      .set({ status: "error", lastSyncError: error, updatedAt: new Date() })
      .where(eq(accountIntegrations.id, id));
  }
}
