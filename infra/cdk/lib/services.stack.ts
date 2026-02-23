import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";

import type { QueueMap, TopicMap } from "./messaging.stack.js";

export interface ServicesStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  cluster: ecs.Cluster;
  rdsSecret: secretsmanager.ISecret;
  redisEndpoint: string;
  queues: QueueMap;
  topics: TopicMap;
}

export type ServiceMap = Record<string, ecs.FargateService>;

const SERVICES = [
  { name: "identity", port: 3001, cpu: 512, memory: 1024 },
  { name: "contacts", port: 3002, cpu: 512, memory: 1024 },
  { name: "events", port: 3003, cpu: 512, memory: 1024 },
  { name: "messaging", port: 3004, cpu: 1024, memory: 2048 },
  { name: "chat", port: 3007, cpu: 512, memory: 1024 },
  { name: "integrations", port: 3008, cpu: 512, memory: 1024 },
  { name: "design", port: 3009, cpu: 512, memory: 1024 },
  { name: "analytics", port: 3010, cpu: 512, memory: 1024 },
] as const;

export class ServicesStack extends cdk.Stack {
  readonly serviceMap: ServiceMap = {};

  constructor(scope: Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);

    const isProd = props.environment === "production";
    const env = props.environment;

    const executionRole = new iam.Role(this, "EcsExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    const taskRole = new iam.Role(this, "EcsTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    props.rdsSecret.grantRead(taskRole);
    props.rdsSecret.grantRead(executionRole);

    for (const queue of Object.values(props.queues)) {
      queue.grantSendMessages(taskRole);
    }
    props.topics.deliveryEvents.grantPublish(taskRole);

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: ["*"],
      })
    );

    for (const svc of SERVICES) {
      const repo = new ecr.Repository(this, `${svc.name}Repo`, {
        repositoryName: `electragram/${svc.name}-service`,
        lifecycleRules: [{ maxImageCount: 10 }],
        removalPolicy: isProd
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      });

      const logGroup = new logs.LogGroup(this, `${svc.name}Logs`, {
        logGroupName: `/electragram/${svc.name}/${env}`,
        retention: isProd
          ? logs.RetentionDays.ONE_MONTH
          : logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      const taskDef = new ecs.FargateTaskDefinition(
        this,
        `${svc.name}TaskDef`,
        {
          cpu: svc.cpu,
          memoryLimitMiB: svc.memory,
          executionRole,
          taskRole,
        }
      );

      taskDef.addContainer(`${svc.name}Container`, {
        image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
        portMappings: [{ containerPort: svc.port, protocol: ecs.Protocol.TCP }],
        logging: ecs.LogDrivers.awsLogs({
          logGroup,
          streamPrefix: svc.name,
        }),
        environment: {
          NODE_ENV: isProd ? "production" : "staging",
          PORT: String(svc.port),
          REDIS_URL: `redis://${props.redisEndpoint}:6379`,
          AWS_REGION: this.region,
          SQS_DELIVERY_EMAIL_URL: props.queues.deliveryEmail.queueUrl,
          SQS_DELIVERY_SMS_URL: props.queues.deliverySms.queueUrl,
          SQS_DELIVERY_WHATSAPP_URL: props.queues.deliveryWhatsapp.queueUrl,
          SNS_DELIVERY_EVENTS_ARN: props.topics.deliveryEvents.topicArn,
        },
        secrets: {
          DATABASE_URL: ecs.Secret.fromSecretsManager(
            props.rdsSecret,
            "connectionString"
          ),
          JWT_PRIVATE_KEY: ecs.Secret.fromSecretsManagerVersion(
            secretsmanager.Secret.fromSecretNameV2(
              this,
              `${svc.name}JwtKey`,
              `electragram/${env}/jwt-private-key`
            ),
            {},
            "privateKey"
          ),
          JWT_PUBLIC_KEY: ecs.Secret.fromSecretsManagerVersion(
            secretsmanager.Secret.fromSecretNameV2(
              this,
              `${svc.name}JwtPubKey`,
              `electragram/${env}/jwt-public-key`
            ),
            {},
            "publicKey"
          ),
        },
        healthCheck: {
          command: [
            "CMD-SHELL",
            `wget -qO- http://localhost:${svc.port}/health || exit 1`,
          ],
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          retries: 3,
        },
      });

      const service = new ecs.FargateService(this, `${svc.name}Service`, {
        cluster: props.cluster,
        taskDefinition: taskDef,
        serviceName: `${svc.name}-${env}`,
        desiredCount: isProd ? 2 : 1,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        circuitBreaker: { rollback: true },
        enableExecuteCommand: true,
        capacityProviderStrategies: [
          {
            capacityProvider: "FARGATE",
            weight: isProd ? 1 : 0,
            base: isProd ? 1 : 0,
          },
          {
            capacityProvider: "FARGATE_SPOT",
            weight: isProd ? 2 : 1,
          },
        ],
      });

      this.serviceMap[svc.name] = service;

      new cdk.CfnOutput(this, `${svc.name}ServiceArn`, {
        value: service.serviceArn,
      });
      new cdk.CfnOutput(this, `${svc.name}RepoUri`, {
        value: repo.repositoryUri,
      });
    }
  }
}
