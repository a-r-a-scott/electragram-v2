import pino from "pino";
import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { SnapshotsService } from "./services/snapshots.service.js";
import { ActivitiesService } from "./services/activities.service.js";
import { ConsumerService } from "./services/consumer.service.js";
import { AwsSqsReceiver } from "./services/sqs.receiver.js";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

function mustEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

async function main() {
  const databaseUrl = mustEnv("DATABASE_URL");
  const jwtPublicKey = mustEnv("JWT_PUBLIC_KEY");
  const analyticsQueueUrl = mustEnv("ANALYTICS_QUEUE_URL");
  const awsRegion = process.env["AWS_REGION"] ?? "us-east-1";

  const app = await buildApp({
    databaseUrl,
    jwtPublicKey,
    nodeEnv: process.env["NODE_ENV"] ?? "production",
    runMigrations: true,
  });

  const db = createDb(databaseUrl);
  const snapshotsService = new SnapshotsService(db);
  const activitiesService = new ActivitiesService(db);
  const receiver = new AwsSqsReceiver(awsRegion);
  const consumer = new ConsumerService(
    snapshotsService,
    activitiesService,
    receiver,
    analyticsQueueUrl,
    log,
  );

  // Start consumer in background — does not block the HTTP server
  consumer.start().catch((err: unknown) => {
    log.fatal({ err }, "Consumer crashed — exiting");
    process.exit(1);
  });

  const host = process.env["HOST"] ?? "0.0.0.0";
  const port = parseInt(process.env["PORT"] ?? "3000", 10);

  await app.listen({ host, port });
  log.info({ host, port }, "Analytics service listening");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Shutting down");
    consumer.stop();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  log.fatal({ err }, "Startup failed");
  process.exit(1);
});
