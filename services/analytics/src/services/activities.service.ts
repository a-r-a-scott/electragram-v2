import { eq, and, lt, desc } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { activities } from "../db/schema.js";
import type { DeliveryEvent } from "./events.js";

export interface ActivityRow {
  id: number;
  accountId: string;
  actorId: string | null;
  actorType: string | null;
  action: string | null;
  relateableId: string | null;
  relateableType: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ListActivitiesOptions {
  accountId: string;
  limit?: number | undefined;
  before?: number | undefined;
  actorId?: string | undefined;
  actorType?: string | undefined;
}

/** Map delivery event kinds to human-readable activity actions */
const KIND_TO_ACTION: Record<string, string> = {
  sent: "message.sent",
  delivered: "message.delivered",
  failed: "message.failed",
  bounced: "message.bounced",
  spam_report: "message.spam_report",
  cancelled: "message.cancelled",
  opened: "message.opened",
  clicked: "message.clicked",
  unsubscribed: "message.unsubscribed",
};

/** Events that warrant an activity record (not every micro-event) */
const RECORDABLE_KINDS = new Set([
  "sent",
  "delivered",
  "failed",
  "bounced",
  "cancelled",
  "unsubscribed",
]);

export class ActivitiesService {
  constructor(private readonly db: Db) {}

  /**
   * Create an activity record for a delivery event.
   * Only called for recordable event kinds to avoid flooding the feed.
   */
  async record(event: DeliveryEvent): Promise<void> {
    if (!RECORDABLE_KINDS.has(event.kind)) return;

    const action = KIND_TO_ACTION[event.kind];
    if (!action) return;

    await this.db.insert(activities).values({
      accountId: event.accountId,
      actorId: event.messageId,
      actorType: "Message",
      action,
      relateableId: event.recipientId ?? null,
      relateableType: event.recipientType === "guest" ? "Guest" : event.recipientId ? "Contact" : null,
      details: {
        channel: event.channel,
        ...(event.details ?? {}),
      },
    });
  }

  /** Create a fully-specified activity (used by other services via internal calls) */
  async create(params: {
    accountId: string;
    actorId?: string;
    actorType?: string;
    action: string;
    relateableId?: string;
    relateableType?: string;
    details?: Record<string, unknown>;
  }): Promise<ActivityRow> {
    const [row] = await this.db
      .insert(activities)
      .values({
        accountId: params.accountId,
        actorId: params.actorId ?? null,
        actorType: params.actorType ?? null,
        action: params.action,
        relateableId: params.relateableId ?? null,
        relateableType: params.relateableType ?? null,
        details: params.details ?? null,
      })
      .returning();

    return row as unknown as ActivityRow;
  }

  /** Paginated activity feed for an account (cursor-based, newest first) */
  async list(opts: ListActivitiesOptions): Promise<ActivityRow[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const conditions = [eq(activities.accountId, opts.accountId)];

    if (opts.before) {
      conditions.push(lt(activities.id, opts.before));
    }
    if (opts.actorId) {
      conditions.push(eq(activities.actorId, opts.actorId));
    }
    if (opts.actorType) {
      conditions.push(eq(activities.actorType, opts.actorType));
    }

    const rows = await this.db
      .select()
      .from(activities)
      .where(and(...conditions))
      .orderBy(desc(activities.id))
      .limit(limit);

    return rows as unknown as ActivityRow[];
  }
}
