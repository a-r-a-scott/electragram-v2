import { describe, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import { MessagingStack } from "../lib/messaging.stack.js";

function createStack(environment: string) {
  const app = new cdk.App();
  return new MessagingStack(app, "TestMessaging", {
    env: { account: "123456789012", region: "us-east-1" },
    environment,
  });
}

describe("MessagingStack", () => {
  it("creates 6 SQS queues with DLQs", () => {
    const stack = createStack("staging");
    const template = Template.fromStack(stack);
    // 6 main queues + 6 DLQs = 12 total
    template.resourceCountIs("AWS::SQS::Queue", 12);
  });

  it("creates the delivery events SNS topic", () => {
    const stack = createStack("staging");
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::SNS::Topic", 1);
  });

  it("creates the EventBridge event bus", () => {
    const stack = createStack("staging");
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::Events::EventBus", 1);
  });

  it("sets DLQ maxReceiveCount to 3", () => {
    const stack = createStack("staging");
    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::SQS::Queue", {
      RedrivePolicy: {
        maxReceiveCount: 3,
      },
    });
  });
});
