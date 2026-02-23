import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "../db/client.js";
import { chatSources } from "../db/schema.js";
import { NotFoundError, ConflictError } from "./errors.js";

export interface SourceRow {
  id: string;
  status: string;
  channel: string;
  provider: string;
  handle: string;
  accountId: string;
  credentialId: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class SourcesService {
  constructor(private readonly db: Db) {}

  async list(accountId: string): Promise<SourceRow[]> {
    return this.db
      .select()
      .from(chatSources)
      .where(eq(chatSources.accountId, accountId)) as unknown as Promise<SourceRow[]>;
  }

  async getById(id: string, accountId: string): Promise<SourceRow> {
    const [row] = await this.db
      .select()
      .from(chatSources)
      .where(and(eq(chatSources.id, id), eq(chatSources.accountId, accountId)));
    if (!row) throw new NotFoundError(`Source ${id} not found`);
    return row as unknown as SourceRow;
  }

  async findByHandle(channel: string, handle: string): Promise<SourceRow | null> {
    const [row] = await this.db
      .select()
      .from(chatSources)
      .where(and(eq(chatSources.channel, channel), eq(chatSources.handle, handle)));
    return (row as unknown as SourceRow) ?? null;
  }

  async create(params: {
    channel: string;
    handle: string;
    accountId: string;
    credentialId?: string | undefined;
    details?: Record<string, unknown> | undefined;
  }): Promise<SourceRow> {
    const existing = await this.findByHandle(params.channel, params.handle);
    if (existing) {
      throw new ConflictError(`Source ${params.handle} (${params.channel}) already registered`);
    }

    const [row] = await this.db
      .insert(chatSources)
      .values({
        id: nanoid(),
        channel: params.channel,
        provider: "twilio",
        handle: params.handle,
        accountId: params.accountId,
        credentialId: params.credentialId ?? null,
        details: params.details ?? null,
      })
      .returning();
    return row as unknown as SourceRow;
  }

  async deactivate(id: string, accountId: string): Promise<SourceRow> {
    await this.getById(id, accountId);
    const [row] = await this.db
      .update(chatSources)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(and(eq(chatSources.id, id), eq(chatSources.accountId, accountId)))
      .returning();
    return row as unknown as SourceRow;
  }
}
