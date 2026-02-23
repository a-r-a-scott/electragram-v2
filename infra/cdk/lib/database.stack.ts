import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export interface DatabaseStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
}

export class DatabaseStack extends cdk.Stack {
  readonly rdsSecret: secretsmanager.ISecret;
  readonly redisEndpoint: string;
  readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const isProd = props.environment === "production";

    // ─── RDS Security Group ───────────────────────────────────────────────────

    this.dbSecurityGroup = new ec2.SecurityGroup(this, "RdsSg", {
      vpc: props.vpc,
      description: "RDS PostgreSQL security group",
      allowAllOutbound: false,
    });

    // ─── RDS PostgreSQL ───────────────────────────────────────────────────────

    const dbInstance = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.R6G,
        isProd ? ec2.InstanceSize.XLARGE : ec2.InstanceSize.LARGE
      ),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.dbSecurityGroup],
      multiAz: isProd,
      allocatedStorage: isProd ? 100 : 20,
      maxAllocatedStorage: isProd ? 500 : 100,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(isProd ? 7 : 1),
      deletionProtection: isProd,
      databaseName: "electragram",
      credentials: rds.Credentials.fromGeneratedSecret("electragram_admin"),
      enablePerformanceInsights: isProd,
    });

    this.rdsSecret = dbInstance.secret!;

    // ─── ElastiCache Redis ────────────────────────────────────────────────────

    const redisSg = new ec2.SecurityGroup(this, "RedisSg", {
      vpc: props.vpc,
      description: "Redis security group",
      allowAllOutbound: false,
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(
      this,
      "RedisSubnetGroup",
      {
        description: "Redis subnet group",
        subnetIds: props.vpc.isolatedSubnets.map((s) => s.subnetId),
      }
    );

    const redisCluster = new elasticache.CfnReplicationGroup(
      this,
      "Redis",
      {
        replicationGroupDescription: `electragram-${props.environment}`,
        numCacheClusters: isProd ? 3 : 1,
        cacheNodeType: isProd ? "cache.r6g.large" : "cache.t4g.small",
        engine: "redis",
        engineVersion: "7.1",
        cacheSubnetGroupName: redisSubnetGroup.ref,
        securityGroupIds: [redisSg.securityGroupId],
        atRestEncryptionEnabled: true,
        transitEncryptionEnabled: true,
        automaticFailoverEnabled: isProd,
        multiAzEnabled: isProd,
      }
    );

    this.redisEndpoint = redisCluster.attrPrimaryEndPointAddress;

    new cdk.CfnOutput(this, "RdsEndpoint", {
      value: dbInstance.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "RedisEndpoint", {
      value: this.redisEndpoint,
    });
    new cdk.CfnOutput(this, "RdsSecretArn", {
      value: this.rdsSecret.secretArn,
    });
  }
}
