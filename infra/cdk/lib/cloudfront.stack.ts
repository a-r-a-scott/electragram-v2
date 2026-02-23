import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as waf from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: string;
  apiGatewayUrl: string;
}

export class CloudFrontStack extends cdk.Stack {
  readonly distributionId: string;
  readonly distributionDomainName: string;

  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    super(scope, id, props);

    const isProd = props.environment === "production";

    // ─── S3 bucket for static assets ─────────────────────────────────────────

    const assetsBucket = new s3.Bucket(this, "AssetsBucket", {
      bucketName: `electragram-assets-${props.environment}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // ─── Media bucket ─────────────────────────────────────────────────────────

    const mediaBucket = new s3.Bucket(this, "MediaBucket", {
      bucketName: `electragram-media-${props.environment}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: isProd,
      lifecycleRules: [
        {
          id: "delete-incomplete-multipart",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ─── WAF Web ACL ──────────────────────────────────────────────────────────

    const webAcl = new waf.CfnWebACL(this, "WebAcl", {
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "electragram-waf",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "CommonRuleSet",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "RateLimitRule",
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "RateLimit",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // ─── CloudFront Distribution ──────────────────────────────────────────────

    const apiOrigin = new origins.HttpOrigin(
      props.apiGatewayUrl.replace("https://", "").replace("/", ""),
      {
        originPath: "",
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      }
    );

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `Electragram ${props.environment}`,
      webAclId: webAcl.attrArn,
      defaultBehavior: {
        origin: apiOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        compress: true,
      },
      additionalBehaviors: {
        "/_next/static/*": {
          origin: new origins.S3Origin(assetsBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },
        "/media/*": {
          origin: new origins.S3Origin(mediaBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: false,
        },
      },
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      enableIpv6: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: isProd
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
    });

    this.distributionId = distribution.distributionId;
    this.distributionDomainName = distribution.distributionDomainName;

    new cdk.CfnOutput(this, "DistributionId", { value: this.distributionId });
    new cdk.CfnOutput(this, "DistributionDomain", {
      value: this.distributionDomainName,
    });
    new cdk.CfnOutput(this, "MediaBucketName", { value: mediaBucket.bucketName });
  }
}
