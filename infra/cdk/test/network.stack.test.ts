import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import { NetworkStack } from "../lib/network.stack.js";

function createStack(environment: string) {
  const app = new cdk.App();
  return new NetworkStack(app, "TestNetwork", {
    env: { account: "123456789012", region: "us-east-1" },
    environment,
  });
}

describe("NetworkStack", () => {
  describe("production", () => {
    it("creates a VPC with 3 NAT gateways", () => {
      const stack = createStack("production");
      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::EC2::NatGateway", 3);
    });

    it("creates an ECS cluster with container insights enabled", () => {
      const stack = createStack("production");
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterSettings: [
          {
            Name: "containerInsights",
            Value: "enabled",
          },
        ],
      });
    });
  });

  describe("staging", () => {
    it("creates a VPC with 1 NAT gateway", () => {
      const stack = createStack("staging");
      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::EC2::NatGateway", 1);
    });
  });

  it("creates 3 availability zones of subnets", () => {
    const stack = createStack("staging");
    const template = Template.fromStack(stack);
    // Public + Private + Isolated = 9 subnets total (3 per type × 3 AZs)
    const subnets = template.findResources("AWS::EC2::Subnet");
    expect(Object.keys(subnets).length).toBe(9);
  });
});
