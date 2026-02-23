import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "../db/client.js";
import { chatIdentities } from "../db/schema.js";

export interface IdentityRow {
  id: string;
  handle: string | null;
  accountId: string;
  channel: string;
  optedInAt: Date | null;
  optedOutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class IdentitiesService {
  constructor(private readonly db: Db) {}

  async findByHandle(accountId: string, channel: string, handle: string): Promise<IdentityRow | null> {
    const [row] = await this.db
      .select()
      .from(chatIdentities)
      .where(
        and(
          eq(chatIdentities.accountId, accountId),
          eq(chatIdentities.channel, channel),
          eq(chatIdentities.handle, handle),
        ),
      );
    return (row as unknown as IdentityRow) ?? null;
  }

  /** Find an existing identity or create a new one (upsert pattern) */
  async findOrCreate(params: {
    accountId: string;
    channel: string;
    handle: string;
  }): Promise<IdentityRow> {
    const existing = await this.findByHandle(params.accountId, params.channel, params.handle);
    if (existing) return existing;

    const [row] = await this.db
      .insert(chatIdentities)
      .values({
        id: nanoid(),
        accountId: params.accountId,
        channel: params.channel,
        handle: params.handle,
      })
      .returning();
    return row as unknown as IdentityRow;
  }

  async recordOptIn(identityId: string): Promise<void> {
    await this.db
      .update(chatIdentities)
      .set({ optedInAt: new Date(), optedOutAt: null, updatedAt: new Date() })
      .where(eq(chatIdentities.id, identityId));
  }

  async recordOptOut(identityId: string): Promise<void> {
    await this.db
      .update(chatIdentities)
      .set({ optedOutAt: new Date(), updatedAt: new Date() })
      .where(eq(chatIdentities.id, identityId));
  }
}
