import { eq, and, desc, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "../db/client.js";
import { chatConversations } from "../db/schema.js";
import { NotFoundError } from "./errors.js";

export interface ConversationRow {
  id: string;
  status: string;
  accountId: string;
  sourceId: string;
  channel: string;
  provider: string;
  handle: string;
  identityId: string | null;
  unreadAt: Date | null;
  lastMessageAt: Date | null;
  searchText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListConversationsOptions {
  accountId: string;
  status?: string | undefined;
  unreadOnly?: boolean | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export class ConversationsService {
  constructor(private readonly db: Db) {}

  async list(opts: ListConversationsOptions): Promise<ConversationRow[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;

    let query = this.db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.accountId, opts.accountId))
      .$dynamic();

    if (opts.status) {
      query = query.where(eq(chatConversations.status, opts.status as never));
    }
    if (opts.unreadOnly) {
      query = query.where(isNotNull(chatConversations.unreadAt));
    }
    if (opts.search) {
      query = query.where(
        sql`${chatConversations.searchTextTsv} @@ plainto_tsquery('english', ${opts.search})`,
      );
    }

    return query
      .orderBy(desc(chatConversations.lastMessageAt))
      .limit(limit)
      .offset(offset) as unknown as Promise<ConversationRow[]>;
  }

  async getById(id: string, accountId: string): Promise<ConversationRow> {
    const [row] = await this.db
      .select()
      .from(chatConversations)
      .where(and(eq(chatConversations.id, id), eq(chatConversations.accountId, accountId)));
    if (!row) throw new NotFoundError(`Conversation ${id} not found`);
    return row as unknown as ConversationRow;
  }

  /** Find an open conversation for a given source + external handle */
  async findOpenBySourceAndHandle(
    sourceId: string,
    handle: string,
  ): Promise<ConversationRow | null> {
    const [row] = await this.db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.sourceId, sourceId),
          eq(chatConversations.handle, handle),
          eq(chatConversations.status, "open"),
        ),
      );
    return (row as unknown as ConversationRow) ?? null;
  }

  /** Find or create a conversation — called for each inbound message */
  async findOrCreate(params: {
    accountId: string;
    sourceId: string;
    channel: string;
    provider: string;
    handle: string;
    identityId?: string | undefined;
  }): Promise<ConversationRow> {
    const existing = await this.findOpenBySourceAndHandle(params.sourceId, params.handle);
    if (existing) return existing;

    const [row] = await this.db
      .insert(chatConversations)
      .values({
        id: nanoid(),
        accountId: params.accountId,
        sourceId: params.sourceId,
        channel: params.channel,
        provider: params.provider,
        handle: params.handle,
        identityId: params.identityId ?? null,
        searchText: params.handle,
      })
      .returning();
    return row as unknown as ConversationRow;
  }

  async updateStatus(
    id: string,
    accountId: string,
    status: "open" | "resolved" | "opted_out",
  ): Promise<ConversationRow> {
    await this.getById(id, accountId);
    const [row] = await this.db
      .update(chatConversations)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(chatConversations.id, id), eq(chatConversations.accountId, accountId)))
      .returning();
    return row as unknown as ConversationRow;
  }

  async markUnread(id: string, at: Date): Promise<void> {
    await this.db
      .update(chatConversations)
      .set({ unreadAt: at, lastMessageAt: at, updatedAt: new Date() })
      .where(eq(chatConversations.id, id));
  }

  async markRead(id: string, accountId: string): Promise<void> {
    await this.getById(id, accountId);
    await this.db
      .update(chatConversations)
      .set({ unreadAt: null, updatedAt: new Date() })
      .where(and(eq(chatConversations.id, id), eq(chatConversations.accountId, accountId)));
  }
}
