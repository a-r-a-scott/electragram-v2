import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import websocket from "@fastify/websocket";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createAuthMiddleware } from "./middleware/auth.middleware.js";
import { SourcesService } from "./services/sources.service.js";
import { IdentitiesService } from "./services/identities.service.js";
import { ConversationsService } from "./services/conversations.service.js";
import { MessagesService } from "./services/messages.service.js";
import type { TwilioSender } from "./services/messages.service.js";
import { WsManager } from "./ws/manager.js";
import { registerSourceRoutes } from "./routes/sources.routes.js";
import { registerConversationRoutes } from "./routes/conversations.routes.js";
import { registerMessageRoutes } from "./routes/messages.routes.js";
import { registerWsRoutes } from "./routes/ws.routes.js";

export interface AppConfig {
  databaseUrl: string;
  nodeEnv?: string;
  jwtPublicKey?: string;
  runMigrations?: boolean;
  twilio?: TwilioSender;
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.nodeEnv !== "test" });

  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(websocket);

  const db = createDb(config.databaseUrl);
  if (config.runMigrations) await runMigrations(db);

  const wsManager = new WsManager();
  const sourcesService = new SourcesService(db);
  const identitiesService = new IdentitiesService(db);
  const conversationsService = new ConversationsService(db);

  // Use a stub sender in test/dev if not provided
  const twilioSender: TwilioSender = config.twilio ?? {
    async send() { return { sid: "SM_stub" }; },
  };
  const messagesService = new MessagesService(db, twilioSender);

  const jwtPublicKey = config.jwtPublicKey ?? "test-key";
  const authMiddleware = createAuthMiddleware(jwtPublicKey);
  app.addHook("preHandler", authMiddleware);

  app.get("/health", { config: { public: true } }, async () => ({
    status: "ok",
    service: "chat",
    connections: wsManager.totalConnections(),
  }));

  registerSourceRoutes(app, sourcesService);
  registerConversationRoutes(app, conversationsService);
  registerMessageRoutes(app, conversationsService, messagesService);
  registerWsRoutes(app, wsManager, jwtPublicKey);

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const isInternal = statusCode >= 500;
    if (isInternal) app.log.error(error);
    return reply.code(statusCode).send({
      success: false,
      error: {
        code: error.name ?? "INTERNAL_ERROR",
        message: isInternal ? "Internal server error" : error.message,
      },
    });
  });

  return app;
}
