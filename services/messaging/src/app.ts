import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createAuthMiddleware } from "./middleware/auth.middleware.js";
import { TemplatesService } from "./services/templates.service.js";
import { MessagesService } from "./services/messages.service.js";
import { UnsubscribesService } from "./services/unsubscribes.service.js";
import { MockSqsDispatcher, SqsService } from "./services/sqs.service.js";
import { registerTemplateRoutes } from "./routes/templates.routes.js";
import { registerMessageRoutes } from "./routes/messages.routes.js";
import { registerUnsubscribeRoutes } from "./routes/unsubscribes.routes.js";

export interface AppConfig {
  databaseUrl: string;
  jwtPublicKey?: string;
  nodeEnv?: string;
  runMigrations?: boolean;
  sqsQueueUrl?: string;
  sqsRegion?: string;
  sqsEndpoint?: string;
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.nodeEnv !== "test" });

  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });

  const db = createDb(config.databaseUrl);
  if (config.runMigrations) await runMigrations(db);

  const sqsCfg: Record<string, string> = { queueUrl: config.sqsQueueUrl ?? "" };
  if (config.sqsRegion) sqsCfg.region = config.sqsRegion;
  if (config.sqsEndpoint) sqsCfg.endpoint = config.sqsEndpoint;

  const sqs =
    config.sqsQueueUrl
      ? new SqsService(sqsCfg as any)
      : new MockSqsDispatcher();

  const templatesService = new TemplatesService(db);
  const messagesService = new MessagesService(db, sqs);
  const unsubscribesService = new UnsubscribesService(db);

  const authMiddleware = createAuthMiddleware(config.jwtPublicKey ?? "test-key");
  app.addHook("preHandler", authMiddleware);

  app.get("/health", { config: { public: true } }, async () => ({
    status: "ok",
    service: "messaging",
  }));

  await registerTemplateRoutes(app, templatesService);
  await registerMessageRoutes(app, messagesService);
  await registerUnsubscribeRoutes(app, unsubscribesService);

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const isServer = statusCode >= 500;
    app.log.error({ err: error }, "Request error");
    return reply.code(statusCode).send({
      success: false,
      error: {
        code: error.name ?? "INTERNAL_ERROR",
        message: isServer ? "Internal server error" : error.message,
      },
    });
  });

  return app;
}
