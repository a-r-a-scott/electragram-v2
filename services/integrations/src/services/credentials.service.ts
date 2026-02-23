import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "../db/client.js";
import { credentials } from "../db/schema.js";
import { NotFoundError } from "./errors.js";
import { encryptSecrets, decryptSecrets } from "./crypto.js";

export interface CredentialRow {
  id: string;
  accountId: string;
  provider: string;
  status: string;
  label: string | null;
  externalKey: string | null;
  expiresAt: Date | null;
  config: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CredentialWithSecrets extends CredentialRow {
  secrets: Record<string, unknown>;
}

export class CredentialsService {
  constructor(
    private readonly db: Db,
    private readonly encryptionKey: string,
  ) {}

  async list(accountId: string, provider?: string): Promise<CredentialRow[]> {
    let query = this.db
      .select({
        id: credentials.id,
        accountId: credentials.accountId,
        provider: credentials.provider,
        status: credentials.status,
        label: credentials.label,
        externalKey: credentials.externalKey,
        expiresAt: credentials.expiresAt,
        config: credentials.config,
        createdAt: credentials.createdAt,
        updatedAt: credentials.updatedAt,
      })
      .from(credentials)
      .where(eq(credentials.accountId, accountId))
      .$dynamic();

    if (provider) {
      query = query.where(eq(credentials.provider, provider));
    }

    return query as unknown as Promise<CredentialRow[]>;
  }

  async getById(id: string, accountId: string): Promise<CredentialRow> {
    const [row] = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.id, id), eq(credentials.accountId, accountId)));
    if (!row) throw new NotFoundError(`Credential ${id} not found`);
    return row as unknown as CredentialRow;
  }

  async getWithSecrets(id: string, accountId: string): Promise<CredentialWithSecrets> {
    const [row] = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.id, id), eq(credentials.accountId, accountId)));
    if (!row) throw new NotFoundError(`Credential ${id} not found`);

    const rawRow = row as unknown as CredentialRow & { secrets: string | null };
    const decryptedSecrets = rawRow.secrets
      ? decryptSecrets(rawRow.secrets, this.encryptionKey)
      : {};

    return { ...rawRow, secrets: decryptedSecrets };
  }

  async create(params: {
    accountId: string;
    provider: string;
    label?: string | undefined;
    externalKey?: string | undefined;
    expiresAt?: Date | undefined;
    config?: Record<string, unknown> | undefined;
    secrets: Record<string, unknown>;
  }): Promise<CredentialRow> {
    const encryptedSecrets = encryptSecrets(params.secrets, this.encryptionKey);

    const [row] = await this.db
      .insert(credentials)
      .values({
        id: nanoid(),
        accountId: params.accountId,
        provider: params.provider,
        label: params.label ?? null,
        externalKey: params.externalKey ?? null,
        expiresAt: params.expiresAt ?? null,
        config: params.config ?? null,
        secrets: encryptedSecrets,
      })
      .returning();

    const result = row as unknown as CredentialRow & { secrets: string };
    const { secrets: _secrets, ...rest } = result;
    return rest as CredentialRow;
  }

  async updateSecrets(id: string, accountId: string, secrets: Record<string, unknown>, expiresAt?: Date): Promise<void> {
    await this.getById(id, accountId);
    const encryptedSecrets = encryptSecrets(secrets, this.encryptionKey);
    await this.db
      .update(credentials)
      .set({
        secrets: encryptedSecrets,
        ...(expiresAt ? { expiresAt } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(credentials.id, id), eq(credentials.accountId, accountId)));
  }

  async revoke(id: string, accountId: string): Promise<void> {
    await this.getById(id, accountId);
    await this.db
      .update(credentials)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(and(eq(credentials.id, id), eq(credentials.accountId, accountId)));
  }
}
