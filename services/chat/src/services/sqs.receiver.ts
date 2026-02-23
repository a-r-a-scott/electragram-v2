import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";

export interface SqsMessage {
  MessageId?: string | undefined;
  ReceiptHandle?: string | undefined;
  Body?: string | undefined;
}

export interface SqsReceiver {
  receiveMessages(queueUrl: string): Promise<SqsMessage[]>;
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
}

export class AwsSqsReceiver implements SqsReceiver {
  private readonly client: SQSClient;

  constructor(region: string) {
    this.client = new SQSClient({ region });
  }

  async receiveMessages(queueUrl: string): Promise<SqsMessage[]> {
    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
      }),
    );
    return result.Messages ?? [];
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }),
    );
  }
}
