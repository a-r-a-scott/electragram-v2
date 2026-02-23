import type { Timestamps } from "./common.js";

export interface ChatConversation extends Timestamps {
  id: string;
  accountId: string;
  sourceId: string;
  channel: string;
  provider: string;
  handle: string;
  identityId: string | null;
  status: string;
  optedInAt: string | null;
  optedOutAt: string | null;
  unreadAt: string | null;
  lastMessageAt: string | null;
}

export interface ChatMessage extends Timestamps {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  status: string;
  content: string;
  externalMessageKey: string | null;
  mediaUrls: string[];
}
