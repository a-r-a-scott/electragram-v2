import type { Logger } from "pino";
import { parseEventBody } from "./events.js";
import type { SnapshotsService } from "./snapshots.service.js";
import type { ActivitiesService } from "./activities.service.js";

/** Minimal SQS message shape (subset of AWS SDK ReceiveMessageResult) */
export interface SqsMessage {
  MessageId?: string | undefined;
  ReceiptHandle?: string | undefined;
  Body?: string | undefined;
}

/** Abstraction over the AWS SQS client — enables unit testing without real AWS */
export interface SqsReceiver {
  receiveMessages(queueUrl: string): Promise<SqsMessage[]>;
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
}

export class ConsumerService {
  private stopped = false;

  constructor(
    private readonly snapshots: SnapshotsService,
    private readonly activitiesService: ActivitiesService,
    private readonly receiver: SqsReceiver,
    private readonly queueUrl: string,
    private readonly log: Logger,
  ) {}

  /** Start the polling loop — resolves only when `stop()` is called */
  async start(): Promise<void> {
    this.stopped = false;
    this.log.info({ queueUrl: this.queueUrl }, "Analytics consumer started");

    while (!this.stopped) {
      try {
        await this.poll();
      } catch (err) {
        this.log.error({ err }, "Consumer poll error — retrying in 5s");
        await sleep(5_000);
      }
    }

    this.log.info("Analytics consumer stopped");
  }

  stop(): void {
    this.stopped = true;
  }

  /** Poll once and process all available messages */
  private async poll(): Promise<void> {
    const messages = await this.receiver.receiveMessages(this.queueUrl);
    await Promise.all(messages.map((m) => this.processMessage(m)));
  }

  /**
   * Process a single SQS message.
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
      event = parseEventBody(msg.Body);
    } catch (err) {
      this.log.error({ err, msgId: msg.MessageId }, "Failed to parse event — discarding");
      if (msg.ReceiptHandle) {
        await this.receiver.deleteMessage(this.queueUrl, msg.ReceiptHandle);
      }
      return;
    }

    try {
      await this.snapshots.increment(event);
      await this.activitiesService.record(event);
      this.log.debug({ kind: event.kind, messageId: event.messageId }, "Event processed");
    } catch (err) {
      this.log.error({ err, event }, "Failed to process event — leaving in queue for retry");
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
