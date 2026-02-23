import { z } from "zod";

import { ChannelSchema } from "./common.js";
import type { Timestamps } from "./common.js";

// ─── Message ──────────────────────────────────────────────────────────────────

export const MessageStatusSchema = z.enum([
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
  "downloaded",
]);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageKindSchema = z.enum(["standard", "event", "chat"]);
export type MessageKind = z.infer<typeof MessageKindSchema>;

export interface Message extends Timestamps {
  id: string;
  accountId: string;
  status: MessageStatus;
  kind: MessageKind;
  label: string | null;
  description: string | null;
  subjectLabel: string | null;
  recipientLabel: string | null;
  preheaderLabel: string | null;
  senderName: string | null;
  senderEmail: string | null;
  senderProfileId: string | null;
  themeId: string | null;
  templateId: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  deliveryChannel: string;
  triggerId: string | null;
}

// ─── Message Release ──────────────────────────────────────────────────────────

export const ReleaseStatusSchema = z.enum([
  "scheduled",
  "processing",
  "populated",
  "sending",
  "sent",
  "cancelled",
]);
export type ReleaseStatus = z.infer<typeof ReleaseStatusSchema>;

export interface MessageRelease extends Timestamps {
  id: string;
  messageId: string;
  status: ReleaseStatus;
  channel: string;
  releaseAt: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  queuedCount: number;
  sentCount: number;
  failedCount: number;
  number: number;
}

// ─── Message Delivery ─────────────────────────────────────────────────────────

export const DeliveryStatusSchema = z.enum([
  "queued",
  "sent",
  "delivered",
  "failed",
  "bounced",
]);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export interface MessageDelivery extends Timestamps {
  id: string;
  messageId: string;
  accountId: string;
  recipientId: string;
  releaseId: string;
  channel: string;
  status: DeliveryStatus;
  token: string;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
  spammed: boolean;
  unsubscribed: boolean;
  openedAt: string | null;
  clickedAt: string | null;
  name: string | null;
  details: Record<string, unknown>;
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const TriggerKindSchema = z.enum([
  "guest_level",
  "event_level",
  "time_based",
  "api",
]);
export type TriggerKind = z.infer<typeof TriggerKindSchema>;

export interface Trigger extends Timestamps {
  id: string;
  accountId: string;
  eventId: string | null;
  title: string;
  description: string | null;
  kind: TriggerKind;
  isActive: boolean;
  audienceType: string;
  delayType: string;
}

// ─── API Schemas ──────────────────────────────────────────────────────────────

export const CreateMessageBodySchema = z.object({
  kind: MessageKindSchema.default("standard"),
  label: z.string().min(1),
  description: z.string().optional(),
  deliveryChannel: ChannelSchema,
  senderProfileId: z.string().optional(),
  themeId: z.string().optional(),
});
export type CreateMessageBody = z.infer<typeof CreateMessageBodySchema>;
