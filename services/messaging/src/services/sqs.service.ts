import {
  SQSClient,
  SendMessageCommand,
  type SendMessageCommandInput,
} from "@aws-sdk/client-sqs";

export interface DispatchPayload {
  messageId: string;
  recipientId: string;
  accountId: string;
  kind: string;
  to: string;
  subject: string;
  body: string;
  bodyHtml: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface SqsDispatcher {
  send(payload: DispatchPayload): Promise<string>;
}

export interface SqsConfig {
  queueUrl: string;
  region?: string;
  endpoint?: string;
}

export class SqsService implements SqsDispatcher {
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(config: SqsConfig) {
    this.queueUrl = config.queueUrl;
    this.client = new SQSClient({
      region: config.region ?? "us-east-1",
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
  }

  async send(payload: DispatchPayload): Promise<string> {
    const input: SendMessageCommandInput = {
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(payload),
      MessageAttributes: {
        messageId: {
          DataType: "String",
          StringValue: payload.messageId,
        },
        kind: {
          DataType: "String",
          StringValue: payload.kind,
        },
      },
      MessageGroupId: payload.accountId,
      MessageDeduplicationId: payload.recipientId,
    };

    const response = await this.client.send(new SendMessageCommand(input));
    return response.MessageId ?? payload.recipientId;
  }
}

/**
 * No-op SQS dispatcher used in tests and local dev without SQS.
 * Records all sent payloads in memory for assertion.
 */
export class MockSqsDispatcher implements SqsDispatcher {
  readonly sent: DispatchPayload[] = [];

  async send(payload: DispatchPayload): Promise<string> {
    this.sent.push(payload);
    return `mock-sqs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  reset(): void {
    this.sent.length = 0;
  }
}
