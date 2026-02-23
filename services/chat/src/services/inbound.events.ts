/**
 * Inbound event types delivered to the `chat-inbound` SQS queue
 * by the Webhook service.
 */

export type InboundKind = "inbound_sms" | "inbound_whatsapp";

export interface InboundEvent {
  kind: InboundKind;
  /** The sender's phone / WhatsApp number */
  from: string;
  /** Our Twilio number (maps to a ChatSource.handle) */
  to: string;
  body: string;
  messageSid: string;
  numMedia?: number;
  mediaUrls?: string[];
}

/** SNS notification envelope (SQS body when subscribed via SNS) */
interface SnsEnvelope {
  Type: "Notification";
  TopicArn: string;
  Message: string;
}

export function parseInboundEvent(raw: string): InboundEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Non-JSON SQS body: ${raw.slice(0, 120)}`);
  }

  // Unwrap SNS envelope if present
  const obj = parsed as Record<string, unknown>;
  if (obj["Type"] === "Notification" && typeof obj["Message"] === "string") {
    const env = parsed as SnsEnvelope;
    try {
      parsed = JSON.parse(env.Message);
    } catch {
      throw new Error(`SNS Message field is not valid JSON: ${env.Message.slice(0, 120)}`);
    }
  }

  const event = parsed as InboundEvent;
  if (!event.kind || !event.from || !event.to) {
    throw new Error(`InboundEvent missing required fields: ${JSON.stringify(event)}`);
  }
  return event;
}

export function channelFromKind(kind: InboundKind): "sms" | "whatsapp" {
  return kind === "inbound_whatsapp" ? "whatsapp" : "sms";
}
