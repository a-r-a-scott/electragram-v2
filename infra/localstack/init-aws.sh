#!/bin/bash
# LocalStack initialisation — creates all required AWS resources for local development

set -e

echo "Initialising LocalStack resources..."

AWS="awslocal"
REGION="us-east-1"

# ─── SQS Queues ───────────────────────────────────────────────────────────────

for queue in delivery-email delivery-sms delivery-whatsapp chat-inbound delivery-status media-processing; do
  $AWS sqs create-queue --queue-name "${queue}-dlq" --region $REGION
  $AWS sqs create-queue \
    --queue-name "$queue" \
    --attributes "RedrivePolicy={\"deadLetterTargetArn\":\"arn:aws:sqs:${REGION}:000000000000:${queue}-dlq\",\"maxReceiveCount\":\"3\"}" \
    --region $REGION
  echo "Created queue: $queue"
done

# ─── SNS Topics ───────────────────────────────────────────────────────────────

$AWS sns create-topic --name delivery-events --region $REGION
echo "Created topic: delivery-events"

# ─── S3 Buckets ───────────────────────────────────────────────────────────────

$AWS s3 mb s3://electragram-media-dev --region $REGION
$AWS s3 mb s3://electragram-assets-dev --region $REGION
echo "Created S3 buckets"

# ─── Secrets Manager ──────────────────────────────────────────────────────────

# Generate a test RSA key pair for JWT signing
openssl genrsa -out /tmp/jwt_private.pem 2048 2>/dev/null
openssl rsa -in /tmp/jwt_private.pem -pubout -out /tmp/jwt_public.pem 2>/dev/null

PRIVATE_KEY=$(cat /tmp/jwt_private.pem)
PUBLIC_KEY=$(cat /tmp/jwt_public.pem)

$AWS secretsmanager create-secret \
  --name "electragram/development/jwt-private-key" \
  --secret-string "{\"privateKey\":\"$(echo $PRIVATE_KEY | tr '\n' '|')\"}" \
  --region $REGION

$AWS secretsmanager create-secret \
  --name "electragram/development/jwt-public-key" \
  --secret-string "{\"publicKey\":\"$(echo $PUBLIC_KEY | tr '\n' '|')\"}" \
  --region $REGION

echo "Created JWT secrets"

# ─── KMS Keys ─────────────────────────────────────────────────────────────────

$AWS kms create-key --description "Electragram field encryption key" --region $REGION
echo "Created KMS key"

echo "LocalStack initialisation complete!"
