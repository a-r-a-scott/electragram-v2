import { eq, and, sql, desc } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { messageAnalyticsSnapshots } from "../db/schema.js";
import { NotFoundError } from "./errors.js";
import type { DeliveryEvent } from "./events.js";
import { todayUtc } from "./events.js";

export interface SnapshotRow {
  id: number;
  messageId: string;
  accountId: string;
  day: string;
  channel: string;
  sends: number;
  deliveries: number;
  bounces: number;
  spamReports: number;
  failures: number;
  cancels: number;
  opens: number;
  totalOpens: number;
  clicks: number;
  totalClicks: number;
  unsubscribes: number;
  links: Record<string, number>;
  details: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SnapshotSummary {
  messageId: string;
  accountId: string;
  channel: string;
  sends: number;
  deliveries: number;
  bounces: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

/** Column incremented per event kind */
const KIND_TO_COLUMN: Record<string, string | null> = {
  sent: "sends",
  delivered: "deliveries",
  bounced: "bounces",
  spam_report: "spam_reports",
  failed: "failures",
  cancelled: "cancels",
  opened: "opens",
  clicked: "clicks",
  unsubscribed: "unsubscribes",
};

export class SnapshotsService {
  constructor(private readonly db: Db) {}

  /**
   * Upsert a daily snapshot row and increment the counter for the event kind.
   * Uses PostgreSQL ON CONFLICT ... DO UPDATE for atomic increments.
   */
  async increment(event: DeliveryEvent): Promise<void> {
    const col = KIND_TO_COLUMN[event.kind];
    if (!col) return; // unknown kind — ignore silently

    const day = event.day ?? todayUtc();
    const channel = event.channel ?? "email";

    // Build SET clause. For "opened" we also increment total_opens.
    // For "clicked" we also increment total_clicks and optionally track the URL.
    const setClauses: string[] = [
      `${col} = analytics.message_analytics_snapshots.${col} + 1`,
      `updated_at = NOW()`,
    ];

    if (event.kind === "opened") {
      setClauses.push(
        `total_opens = analytics.message_analytics_snapshots.total_opens + 1`,
      );
    }

    if (event.kind === "clicked" && event.url) {
      setClauses.push(
        `total_clicks = analytics.message_analytics_snapshots.total_clicks + 1`,
        `links = analytics.message_analytics_snapshots.links || jsonb_build_object($1::text, COALESCE((analytics.message_analytics_snapshots.links->$1::text)::int, 0) + 1)`,
      );
    }

    // Use raw SQL for the upsert to keep the increment atomic.
    await this.db.execute(sql`
      INSERT INTO analytics.message_analytics_snapshots
        (message_id, account_id, channel, day, interval, ${sql.raw(col)})
      VALUES
        (${event.messageId}, ${event.accountId}, ${channel}, ${day}::date, 0, 1)
      ON CONFLICT (channel, message_id, day, interval)
      DO UPDATE SET
        ${sql.raw(setClauses.join(", "))}
    `);

    // Separate update for URL click tracking (jsonb requires special handling)
    if (event.kind === "clicked" && event.url) {
      await this.db.execute(sql`
        UPDATE analytics.message_analytics_snapshots
        SET
          total_clicks = total_clicks + 1,
          links = links || jsonb_build_object(
            ${event.url}::text,
            COALESCE((links->>${event.url}::text)::int, 0) + 1
          ),
          updated_at = NOW()
        WHERE message_id = ${event.messageId}
          AND channel = ${channel}
          AND day = ${day}::date
          AND interval = 0
      `);
    }
  }

  /** List daily snapshots for a message */
  async listByMessage(
    messageId: string,
    accountId: string,
    channel?: string,
  ): Promise<SnapshotRow[]> {
    const conditions = [
      eq(messageAnalyticsSnapshots.messageId, messageId),
      eq(messageAnalyticsSnapshots.accountId, accountId),
    ];
    if (channel) {
      conditions.push(eq(messageAnalyticsSnapshots.channel, channel));
    }

    const rows = await this.db
      .select()
      .from(messageAnalyticsSnapshots)
      .where(and(...conditions))
      .orderBy(desc(messageAnalyticsSnapshots.day));

    return rows as unknown as SnapshotRow[];
  }

  /** Aggregate summary across all days for a message */
  async summarise(messageId: string, accountId: string): Promise<SnapshotSummary> {
    const rows = await this.listByMessage(messageId, accountId);
    if (rows.length === 0) {
      throw new NotFoundError(`No analytics found for message ${messageId}`);
    }

    const sum = (field: keyof SnapshotRow): number =>
      rows.reduce((acc, r) => acc + ((r[field] as number) ?? 0), 0);

    const sends = sum("sends");
    const deliveries = sum("deliveries");
    const opens = sum("opens");
    const clicks = sum("clicks");
    const bounces = sum("bounces");

    return {
      messageId,
      accountId,
      channel: rows[0]?.channel ?? "email",
      sends,
      deliveries,
      bounces,
      opens,
      clicks,
      unsubscribes: sum("unsubscribes"),
      openRate: sends > 0 ? opens / sends : 0,
      clickRate: sends > 0 ? clicks / sends : 0,
      bounceRate: sends > 0 ? bounces / sends : 0,
    };
  }
}
