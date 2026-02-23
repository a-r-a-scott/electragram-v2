/**
 * Canonical event types produced by Delivery and Tracking services,
 * received by Analytics via SNS → SQS.
 */

export type EventKind =
  | "sent"
  | "delivered"
  | "failed"
  | "bounced"
  | "spam_report"
  | "cancelled"
  | "opened"
  | "clicked"
  | "unsubscribed";

export type Channel = "email" | "sms" | "whatsapp";

export interface DeliveryEvent {
  kind: EventKind;
  messageId: string;
  accountId: string;
  channel: Channel;
  recipientId?: string;
  recipientType?: "contact" | "guest";
  /** ISO date string — defaults to today if absent */
  day?: string;
  /** Present on `clicked` events */
  url?: string;
  details?: Record<string, unknown>;
}

/** SNS notification envelope (SQS body when subscribed via SNS) */
interface SnsEnvelope {
  Type: "Notification";
  TopicArn: string;
  Subject?: string;
  Message: string;
}

/**
 * Parse a raw SQS message body into a DeliveryEvent.
 * Handles both direct JSON and SNS-wrapped JSON.
 */
export function parseEventBody(raw: string): DeliveryEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Non-JSON SQS message body: ${raw.slice(0, 120)}`);
  }

  // Unwrap SNS envelope if present
  const obj = parsed as Record<string, unknown>;
  if (obj["Type"] === "Notification" && typeof obj["Message"] === "string") {
    const envelope = parsed as SnsEnvelope;
    try {
      parsed = JSON.parse(envelope.Message);
    } catch {
      throw new Error(`SNS Message field is not valid JSON: ${envelope.Message.slice(0, 120)}`);
    }
  }

  const event = parsed as DeliveryEvent;
  if (!event.kind || !event.messageId || !event.accountId) {
    throw new Error(`DeliveryEvent missing required fields: ${JSON.stringify(event)}`);
  }
  return event;
}

/** ISO date string for today (UTC) */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
