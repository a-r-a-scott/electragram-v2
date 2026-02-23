import * as cdk from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as events from "aws-cdk-lib/aws-events";
import type { Construct } from "constructs";

export interface MessagingStackProps extends cdk.StackProps {
  environment: string;
}

export interface QueueMap {
  deliveryEmail: sqs.Queue;
  deliverySms: sqs.Queue;
  deliveryWhatsapp: sqs.Queue;
  chatInbound: sqs.Queue;
  deliveryStatus: sqs.Queue;
  mediaProcessing: sqs.Queue;
}

export interface TopicMap {
  deliveryEvents: sns.Topic;
}

export class MessagingStack extends cdk.Stack {
  readonly queues: QueueMap;
  readonly topics: TopicMap;
  readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props);

    const retentionPeriod = cdk.Duration.days(4);
    const visibilityTimeout = cdk.Duration.seconds(300);

    function makeQueue(
      scope: cdk.Stack,
      name: string,
      overrides: Partial<sqs.QueueProps> = {}
    ): sqs.Queue {
      const dlq = new sqs.Queue(scope, `${name}Dlq`, {
        queueName: `${name}-dlq`,
        retentionPeriod: cdk.Duration.days(14),
      });

      return new sqs.Queue(scope, name, {
        queueName: name,
        retentionPeriod,
        visibilityTimeout,
        deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
        ...overrides,
      });
    }

    const suffix = props.environment === "production" ? "" : `-${props.environment}`;

    this.queues = {
      deliveryEmail: makeQueue(this, `delivery-email${suffix}`),
      deliverySms: makeQueue(this, `delivery-sms${suffix}`),
      deliveryWhatsapp: makeQueue(this, `delivery-whatsapp${suffix}`),
      chatInbound: makeQueue(this, `chat-inbound${suffix}`),
      deliveryStatus: makeQueue(this, `delivery-status${suffix}`),
      mediaProcessing: makeQueue(this, `media-processing${suffix}`, {
        visibilityTimeout: cdk.Duration.seconds(900),
      }),
    };

    this.topics = {
      deliveryEvents: new sns.Topic(this, "DeliveryEvents", {
        topicName: `delivery-events${suffix}`,
        displayName: "Electragram Delivery Events",
      }),
    };

    this.eventBus = new events.EventBus(this, "EventBus", {
      eventBusName: `electragram-events${suffix}`,
    });

    for (const [name, queue] of Object.entries(this.queues)) {
      new cdk.CfnOutput(this, `${name}Url`, { value: queue.queueUrl });
    }
    new cdk.CfnOutput(this, "DeliveryEventsTopicArn", {
      value: this.topics.deliveryEvents.topicArn,
    });
    new cdk.CfnOutput(this, "EventBusName", {
      value: this.eventBus.eventBusName,
    });
  }
}
