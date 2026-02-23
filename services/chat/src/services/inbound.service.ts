import type { Logger } from "pino";
import type { SourcesService } from "./sources.service.js";
import type { IdentitiesService } from "./identities.service.js";
import type { ConversationsService } from "./conversations.service.js";
import type { MessagesService } from "./messages.service.js";
import type { WsManager } from "../ws/manager.js";
import { parseInboundEvent, channelFromKind } from "./inbound.events.js";
import type { SqsMessage, SqsReceiver } from "./sqs.receiver.js";

export class InboundService {
  private stopped = false;

  constructor(
    private readonly sources: SourcesService,
    private readonly identities: IdentitiesService,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly wsManager: WsManager,
    private readonly receiver: SqsReceiver,
    private readonly queueUrl: string,
    private readonly log: Logger,
  ) {}

  /** Start the SQS polling loop — runs until `stop()` is called */
  async start(): Promise<void> {
    this.stopped = false;
    this.log.info({ queueUrl: this.queueUrl }, "Chat inbound consumer started");

    while (!this.stopped) {
      try {
        const messages = await this.receiver.receiveMessages(this.queueUrl);
        await Promise.all(messages.map((m) => this.processMessage(m)));
      } catch (err) {
        this.log.error({ err }, "Inbound poll error — retrying in 5s");
        await sleep(5_000);
      }
    }

    this.log.info("Chat inbound consumer stopped");
  }

  stop(): void {
    this.stopped = true;
  }

  /**
   * Process a single SQS message carrying an inbound Twilio event.
   * Public so tests can call it directly without running the loop.
   */
  async processMessage(msg: SqsMessage): Promise<void> {
    if (!msg.Body) {
      this.log.warn({ msgId: msg.MessageId }, "Empty SQS message body — skipping");
      if (msg.ReceiptHandle) {
        await this.receiver.deleteMessage(this.queueUrl, msg.ReceiptHandle);
      }
      return;
    }

    let event;
    try {
      event = parseInboundEvent(msg.Body);
    } catch (err) {
      this.log.error({ err, msgId: msg.MessageId }, "Failed to parse inbound event — discarding");
      if (msg.ReceiptHandle) {
        await this.receiver.deleteMessage(this.queueUrl, msg.ReceiptHandle);
      }
      return;
    }

    try {
      const channel = channelFromKind(event.kind);

      // 1. Resolve the source (our Twilio number)
      const source = await this.sources.findByHandle(channel, event.to);
      if (!source) {
        this.log.warn({ to: event.to, channel }, "No source found for handle — ignoring");
        if (msg.ReceiptHandle) {
          await this.receiver.deleteMessage(this.queueUrl, msg.ReceiptHandle);
        }
        return;
      }

      // 2. Find or create the external identity
      const identity = await this.identities.findOrCreate({
        accountId: source.accountId,
        channel,
        handle: event.from,
      });

      // 3. Find or create the conversation
      const conversation = await this.conversations.findOrCreate({
        accountId: source.accountId,
        sourceId: source.id,
        channel,
        provider: "twilio",
        handle: event.from,
        identityId: identity.id,
      });

      // 4. Persist the inbound message
      const message = await this.messages.createInbound({
        conversationId: conversation.id,
        content: event.body,
        externalMessageKey: event.messageSid,
        mediaUrls: event.mediaUrls ?? [],
      });

      // 5. Mark conversation as unread
      await this.conversations.markUnread(conversation.id, new Date());

      // 6. Push real-time notification to connected dashboard agents
      this.wsManager.broadcast(source.accountId, {
        type: "message",
        conversationId: conversation.id,
        message: {
          id: message.id,
          direction: message.direction,
          status: message.status,
          content: message.content,
          mediaUrls: message.mediaUrls,
          createdAt: message.createdAt,
        },
      });

      this.log.info(
        { conversationId: conversation.id, messageId: message.id },
        "Inbound message processed",
      );
    } catch (err) {
      this.log.error({ err, event }, "Error processing inbound event — leaving in queue for retry");
      return; // Do NOT delete — let SQS retry
    }

    if (msg.ReceiptHandle) {
      await this.receiver.deleteMessage(this.queueUrl, msg.ReceiptHandle);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
