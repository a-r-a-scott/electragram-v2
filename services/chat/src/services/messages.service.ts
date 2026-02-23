import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "../db/client.js";
import { chatMessages } from "../db/schema.js";
import { NotFoundError } from "./errors.js";

export interface MessageRow {
  id: string;
  direction: string;
  status: string;
  content: string | null;
  externalMessageKey: string | null;
  conversationId: string;
  mediaUrls: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Minimal interface for Twilio outbound send — injectable for testing */
export interface TwilioSender {
  send(params: { to: string; from: string; body: string; channel: string }): Promise<{ sid: string }>;
}

export class MessagesService {
  constructor(
    private readonly db: Db,
    private readonly twilio: TwilioSender,
  ) {}

  async list(conversationId: string, limit = 50): Promise<MessageRow[]> {
    return this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(Math.min(limit, 200)) as unknown as Promise<MessageRow[]>;
  }

  async getById(id: string): Promise<MessageRow> {
    const [row] = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, id));
    if (!row) throw new NotFoundError(`Message ${id} not found`);
    return row as unknown as MessageRow;
  }

  /** Create an inbound message record (called by InboundService) */
  async createInbound(params: {
    conversationId: string;
    content: string;
    externalMessageKey?: string | undefined;
    mediaUrls?: string[] | undefined;
  }): Promise<MessageRow> {
    const [row] = await this.db
      .insert(chatMessages)
      .values({
        id: nanoid(),
        conversationId: params.conversationId,
        direction: "inbound",
        status: "delivered",
        content: params.content,
        externalMessageKey: params.externalMessageKey ?? null,
        mediaUrls: params.mediaUrls ?? [],
      })
      .returning();
    return row as unknown as MessageRow;
  }

  /**
   * Send an outbound reply from an agent.
   * Creates the message record, calls Twilio, updates status.
   */
  async sendOutbound(params: {
    conversationId: string;
    fromHandle: string;
    toHandle: string;
    channel: string;
    content: string;
  }): Promise<MessageRow> {
    // Persist optimistically as "pending"
    const [pendingRow] = await this.db
      .insert(chatMessages)
      .values({
        id: nanoid(),
        conversationId: params.conversationId,
        direction: "outbound",
        status: "pending",
        content: params.content,
        mediaUrls: [],
      })
      .returning();

    const message = pendingRow as unknown as MessageRow;

    try {
      const { sid } = await this.twilio.send({
        to: params.toHandle,
        from: params.fromHandle,
        body: params.content,
        channel: params.channel,
      });

      const [updated] = await this.db
        .update(chatMessages)
        .set({ status: "sent", externalMessageKey: sid, updatedAt: new Date() })
        .where(eq(chatMessages.id, message.id))
        .returning();
      return updated as unknown as MessageRow;
    } catch {
      await this.db
        .update(chatMessages)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(chatMessages.id, message.id));
      throw new Error(`Failed to send message via Twilio`);
    }
  }

  async updateStatus(id: string, status: "sent" | "delivered" | "failed"): Promise<void> {
    await this.db
      .update(chatMessages)
      .set({ status, updatedAt: new Date() })
      .where(eq(chatMessages.id, id));
  }
}
