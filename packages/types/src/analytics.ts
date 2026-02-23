import type { Timestamps } from "./common.js";

export interface MessageAnalyticsSnapshot extends Timestamps {
  id: string;
  messageId: string;
  accountId: string;
  interval: string;
  day: string;
  channel: string;
  sends: number;
  deliveries: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  bounces: number;
  spamReports: number;
  links: Record<string, unknown>;
}

export interface Activity extends Timestamps {
  id: string;
  accountId: string;
  actorType: string;
  actorId: string;
  action: string;
  relateableType: string | null;
  relateableId: string | null;
  details: Record<string, unknown>;
}
