import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

import type { ServiceMap } from "./services.stack.js";

export interface ApiGatewayStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  services: ServiceMap;
}

const SERVICE_ROUTES: Array<{ prefix: string; service: string; port: number }> = [
  { prefix: "/api/auth", service: "identity", port: 3001 },
  { prefix: "/api/accounts", service: "identity", port: 3001 },
  { prefix: "/api/users", service: "identity", port: 3001 },
  { prefix: "/api/me", service: "identity", port: 3001 },
  { prefix: "/api/contacts", service: "contacts", port: 3002 },
  { prefix: "/api/contact-lists", service: "contacts", port: 3002 },
  { prefix: "/api/contact-fields", service: "contacts", port: 3002 },
  { prefix: "/api/events", service: "events", port: 3003 },
  { prefix: "/api/public", service: "events", port: 3003 },
  { prefix: "/api/door", service: "events", port: 3003 },
  { prefix: "/api/messages", service: "messaging", port: 3004 },
  { prefix: "/api/triggers", service: "messaging", port: 3004 },
  { prefix: "/api/sender-profiles", service: "messaging", port: 3004 },
  { prefix: "/api/chat", service: "chat", port: 3007 },
  { prefix: "/api/integrations", service: "integrations", port: 3008 },
  { prefix: "/api/themes", service: "design", port: 3009 },
  { prefix: "/api/design", service: "design", port: 3009 },
  { prefix: "/api/analytics", service: "analytics", port: 3010 },
  { prefix: "/api/activities", service: "analytics", port: 3010 },
];

export class ApiGatewayStack extends cdk.Stack {
  readonly gatewayUrl: string;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const isProd = props.environment === "production";

    // Create an internal ALB per service (VPC Link pattern)
    const vpcLink = new apigateway.VpcLink(this, "VpcLink", {
      targets: [],
      vpcLinkName: `electragram-${props.environment}`,
    });

    // Internal NLB for each service
    const nlbs: Record<string, elbv2.NetworkLoadBalancer> = {};

    for (const route of SERVICE_ROUTES) {
      const svcName = route.service;
      if (nlbs[svcName]) continue;

      const nlb = new elbv2.NetworkLoadBalancer(this, `${svcName}Nlb`, {
        vpc: props.vpc,
        internetFacing: false,
        loadBalancerName: `electragram-${svcName}-${props.environment}`,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });
      nlbs[svcName] = nlb;
    }

    const accessLogGroup = new logs.LogGroup(this, "ApiGwLogs", {
      logGroupName: `/electragram/api-gateway/${props.environment}`,
      retention: isProd ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const api = new apigateway.RestApi(this, "Api", {
      restApiName: `electragram-${props.environment}`,
      description: "Electragram v2 API",
      deployOptions: {
        stageName: props.environment,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
        throttlingBurstLimit: isProd ? 2000 : 200,
        throttlingRateLimit: isProd ? 1000 : 100,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    this.gatewayUrl = api.url;

    new cdk.CfnOutput(this, "ApiGatewayUrl", { value: this.gatewayUrl });
  }
}
