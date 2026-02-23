/**
 * Helpers for working with LocalStack in integration tests.
 * Assumes LocalStack is running (via docker-compose or testcontainers).
 */

export const LOCAL_AWS_CONFIG = {
  region: "us-east-1",
  endpoint: process.env["AWS_ENDPOINT_URL"] ?? "http://localhost:4566",
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
  forcePathStyle: true,
} as const;

/**
 * Generates a deterministic test queue URL for LocalStack.
 */
export function localQueueUrl(queueName: string): string {
  return `http://localhost:4566/000000000000/${queueName}`;
}

/**
 * Generates a deterministic test topic ARN for LocalStack.
 */
export function localTopicArn(topicName: string): string {
  return `arn:aws:sns:us-east-1:000000000000:${topicName}`;
}

/**
 * Generates a deterministic test secret ARN for LocalStack.
 */
export function localSecretArn(secretName: string): string {
  return `arn:aws:secretsmanager:us-east-1:000000000000:secret:${secretName}`;
}
