import pino from "pino";
import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { SourcesService } from "./services/sources.service.js";
import { IdentitiesService } from "./services/identities.service.js";
import { ConversationsService } from "./services/conversations.service.js";
import { MessagesService } from "./services/messages.service.js";
import { WsManager } from "./ws/manager.js";
import { InboundService } from "./services/inbound.service.js";
import { AwsSqsReceiver } from "./services/sqs.receiver.js";
import { TwilioHttpSender } from "./services/twilio.sender.js";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

function mustEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

async function main() {
  const databaseUrl = mustEnv("DATABASE_URL");
  const jwtPublicKey = mustEnv("JWT_PUBLIC_KEY");
  const chatInboundQueueUrl = mustEnv("CHAT_INBOUND_QUEUE_URL");
  const twilioAccountSid = mustEnv("TWILIO_ACCOUNT_SID");
  const twilioAuthToken = mustEnv("TWILIO_AUTH_TOKEN");
  const awsRegion = process.env["AWS_REGION"] ?? "us-east-1";

  const twilioSender = new TwilioHttpSender(twilioAccountSid, twilioAuthToken);

  const app = await buildApp({
    databaseUrl,
    jwtPublicKey,
    nodeEnv: process.env["NODE_ENV"] ?? "production",
    runMigrations: true,
    twilio: twilioSender,
  });

  // Inbound consumer shares services with the HTTP server
  const db = createDb(databaseUrl);
  const wsManager = new WsManager();
  const sourcesService = new SourcesService(db);
  const identitiesService = new IdentitiesService(db);
  const conversationsService = new ConversationsService(db);
  const messagesService = new MessagesService(db, twilioSender);
  const receiver = new AwsSqsReceiver(awsRegion);

  const inboundService = new InboundService(
    sourcesService,
    identitiesService,
    conversationsService,
    messagesService,
    wsManager,
    receiver,
    chatInboundQueueUrl,
    log,
  );

  inboundService.start().catch((err: unknown) => {
    log.fatal({ err }, "Inbound consumer crashed — exiting");
    process.exit(1);
  });

  const host = process.env["HOST"] ?? "0.0.0.0";
  const port = parseInt(process.env["PORT"] ?? "3000", 10);
  await app.listen({ host, port });
  log.info({ host, port }, "Chat service listening");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Shutting down");
    inboundService.stop();
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
