import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";
import { InboundService } from "../../src/services/inbound.service.js";
import type { SourcesService } from "../../src/services/sources.service.js";
import type { IdentitiesService } from "../../src/services/identities.service.js";
import type { ConversationsService } from "../../src/services/conversations.service.js";
import type { MessagesService } from "../../src/services/messages.service.js";
import type { WsManager } from "../../src/ws/manager.js";
import type { SqsReceiver, SqsMessage } from "../../src/services/sqs.receiver.js";

const log = pino({ level: "silent" });

const fakeSource = { id: "src_1", accountId: "acc_1", channel: "sms", handle: "+441234567890", status: "active", provider: "twilio", credentialId: null, details: null, createdAt: new Date(), updatedAt: new Date() };
const fakeIdentity = { id: "id_1", handle: "+447700900123", accountId: "acc_1", channel: "sms", optedInAt: null, optedOutAt: null, createdAt: new Date(), updatedAt: new Date() };
const fakeConversation = { id: "conv_1", accountId: "acc_1", sourceId: "src_1", status: "open", channel: "sms", provider: "twilio", handle: "+447700900123", identityId: "id_1", unreadAt: null, lastMessageAt: null, searchText: null, createdAt: new Date(), updatedAt: new Date() };
const fakeMessage = { id: "msg_1", direction: "inbound", status: "delivered", content: "Hello", externalMessageKey: "SM123", conversationId: "conv_1", mediaUrls: [], createdAt: new Date(), updatedAt: new Date() };

function makeSources(): SourcesService {
  return { findByHandle: vi.fn().mockResolvedValue(fakeSource) } as unknown as SourcesService;
}
function makeIdentities(): IdentitiesService {
  return { findOrCreate: vi.fn().mockResolvedValue(fakeIdentity) } as unknown as IdentitiesService;
}
function makeConversations(): ConversationsService {
  return {
    findOrCreate: vi.fn().mockResolvedValue(fakeConversation),
    markUnread: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConversationsService;
}
function makeMessages(): MessagesService {
  return { createInbound: vi.fn().mockResolvedValue(fakeMessage) } as unknown as MessagesService;
}
function makeWsManager(): WsManager {
  return { broadcast: vi.fn() } as unknown as WsManager;
}
function makeReceiver(): SqsReceiver & { deleted: string[] } {
  const state = { deleted: [] as string[] };
  return {
    ...state,
    async receiveMessages() { return []; },
    async deleteMessage(_url, receipt) { state.deleted.push(receipt); },
  };
}

describe("InboundService.processMessage", () => {
  let sources: ReturnType<typeof makeSources>;
  let identities: ReturnType<typeof makeIdentities>;
  let conversations: ReturnType<typeof makeConversations>;
  let messages: ReturnType<typeof makeMessages>;
  let wsManager: ReturnType<typeof makeWsManager>;
  let receiver: ReturnType<typeof makeReceiver>;
  let service: InboundService;

  beforeEach(() => {
    sources = makeSources();
    identities = makeIdentities();
    conversations = makeConversations();
    messages = makeMessages();
    wsManager = makeWsManager();
    receiver = makeReceiver();
    service = new InboundService(sources, identities, conversations, messages, wsManager, receiver, "https://sqs/test", log);
  });

  it("processes a valid inbound_sms event end-to-end", async () => {
    const body = JSON.stringify({ kind: "inbound_sms", from: "+447700900123", to: "+441234567890", body: "Hello", messageSid: "SM123" });
    await service.processMessage({ MessageId: "m1", ReceiptHandle: "rh1", Body: body });

    expect(sources.findByHandle).toHaveBeenCalledWith("sms", "+441234567890");
    expect(identities.findOrCreate).toHaveBeenCalledWith({ accountId: "acc_1", channel: "sms", handle: "+447700900123" });
    expect(conversations.findOrCreate).toHaveBeenCalled();
    expect(messages.createInbound).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conv_1", content: "Hello" }));
    expect(conversations.markUnread).toHaveBeenCalledWith("conv_1", expect.any(Date));
    expect(wsManager.broadcast).toHaveBeenCalledWith("acc_1", expect.objectContaining({ type: "message" }));
    expect(receiver.deleted).toContain("rh1");
  });

  it("processes a valid inbound_whatsapp event", async () => {
    const body = JSON.stringify({ kind: "inbound_whatsapp", from: "+447700900123", to: "+441234567890", body: "WhatsApp msg", messageSid: "SM456" });
    vi.mocked(sources.findByHandle).mockResolvedValue({ ...fakeSource, channel: "whatsapp" });
    await service.processMessage({ MessageId: "m2", ReceiptHandle: "rh2", Body: body });

    expect(sources.findByHandle).toHaveBeenCalledWith("whatsapp", "+441234567890");
    expect(receiver.deleted).toContain("rh2");
  });

  it("discards message if no source matches the 'to' handle", async () => {
    vi.mocked(sources.findByHandle).mockResolvedValue(null);
    const body = JSON.stringify({ kind: "inbound_sms", from: "+1", to: "+2", body: "test", messageSid: "SM" });
    await service.processMessage({ MessageId: "m3", ReceiptHandle: "rh3", Body: body });

    expect(messages.createInbound).not.toHaveBeenCalled();
    expect(receiver.deleted).toContain("rh3");
  });

  it("discards unparseable messages", async () => {
    await service.processMessage({ MessageId: "m4", ReceiptHandle: "rh4", Body: "bad-json" });

    expect(sources.findByHandle).not.toHaveBeenCalled();
    expect(receiver.deleted).toContain("rh4");
  });

  it("skips empty body messages", async () => {
    await service.processMessage({ MessageId: "m5", ReceiptHandle: "rh5", Body: "" });

    expect(sources.findByHandle).not.toHaveBeenCalled();
    expect(receiver.deleted).toContain("rh5");
  });

  it("does NOT delete when processing throws (allow SQS retry)", async () => {
    vi.mocked(messages.createInbound).mockRejectedValue(new Error("DB error"));
    const body = JSON.stringify({ kind: "inbound_sms", from: "+1", to: "+2", body: "err", messageSid: "SM" });
    vi.mocked(sources.findByHandle).mockResolvedValue(fakeSource);
    await service.processMessage({ MessageId: "m6", ReceiptHandle: "rh6", Body: body });

    expect(receiver.deleted).not.toContain("rh6");
  });

  it("broadcasts a message event to the correct accountId", async () => {
    const body = JSON.stringify({ kind: "inbound_sms", from: "+447700900123", to: "+441234567890", body: "Hi", messageSid: "SM7" });
    await service.processMessage({ MessageId: "m7", ReceiptHandle: "rh7", Body: body });

    const [broadcastedAccountId, broadcastedPayload] = vi.mocked(wsManager.broadcast).mock.calls[0] as [string, { type: string; conversationId: string }];
    expect(broadcastedAccountId).toBe("acc_1");
    expect(broadcastedPayload.type).toBe("message");
    expect(broadcastedPayload.conversationId).toBe("conv_1");
  });

  it("stop() sets stopped flag", () => {
    service.stop();
    expect((service as unknown as { stopped: boolean }).stopped).toBe(true);
  });
});
