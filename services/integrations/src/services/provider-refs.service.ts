import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "../db/client.js";
import { providerRefs } from "../db/schema.js";

export interface ProviderRefRow {
  id: string;
  credentialId: string;
  provider: string;
  externalKey: string;
  recordId: string;
  recordType: string;
  status: string;
  kind: string;
  syncedAt: Date | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ProviderRefsService {
  constructor(private readonly db: Db) {}

  async findByExternalKey(
    provider: string,
    externalKey: string,
    credentialId: string,
  ): Promise<ProviderRefRow | null> {
    const [row] = await this.db
      .select()
      .from(providerRefs)
      .where(
        and(
          eq(providerRefs.provider, provider),
          eq(providerRefs.externalKey, externalKey),
          eq(providerRefs.credentialId, credentialId),
        ),
      );
    return (row as unknown as ProviderRefRow) ?? null;
  }

  async findByRecord(recordId: string, recordType: string, credentialId: string): Promise<ProviderRefRow | null> {
    const [row] = await this.db
      .select()
      .from(providerRefs)
      .where(
        and(
          eq(providerRefs.recordId, recordId),
          eq(providerRefs.recordType, recordType),
          eq(providerRefs.credentialId, credentialId),
        ),
      );
    return (row as unknown as ProviderRefRow) ?? null;
  }

  /** Upsert: create if new external key, update syncedAt if existing */
  async upsert(params: {
    credentialId: string;
    provider: string;
    externalKey: string;
    recordId: string;
    recordType: string;
    kind?: string | undefined;
    details?: Record<string, unknown> | undefined;
  }): Promise<ProviderRefRow> {
    const existing = await this.findByExternalKey(params.provider, params.externalKey, params.credentialId);

    if (existing) {
      const [updated] = await this.db
        .update(providerRefs)
        .set({
          recordId: params.recordId,
          syncedAt: new Date(),
          details: params.details ?? null,
          updatedAt: new Date(),
        })
        .where(eq(providerRefs.id, existing.id))
        .returning();
      return updated as unknown as ProviderRefRow;
    }

    const [row] = await this.db
      .insert(providerRefs)
      .values({
        id: nanoid(),
        credentialId: params.credentialId,
        provider: params.provider,
        externalKey: params.externalKey,
        recordId: params.recordId,
        recordType: params.recordType,
        kind: params.kind ?? "contact",
        details: params.details ?? null,
        syncedAt: new Date(),
      })
      .returning();
    return row as unknown as ProviderRefRow;
  }

  async markDeleted(id: string): Promise<void> {
    await this.db
      .update(providerRefs)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(providerRefs.id, id));
  }
}
