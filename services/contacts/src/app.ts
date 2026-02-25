import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { registerAuthMiddleware } from "./middleware/auth.middleware.js";
import { ContactsService } from "./services/contacts.service.js";
import { ListsService } from "./services/lists.service.js";
import { registerContactRoutes } from "./routes/contacts.routes.js";
import { registerListRoutes } from "./routes/lists.routes.js";

export interface AppConfig {
  databaseUrl: string;
  jwtPublicKey?: string;
  nodeEnv?: string;
  runMigrations?: boolean;
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.nodeEnv !== "test" });

  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

  const db = createDb(config.databaseUrl);
  if (config.runMigrations) await runMigrations(db);

  const contactsService = new ContactsService(db);
  const listsService = new ListsService(db);

  if (config.jwtPublicKey) {
    registerAuthMiddleware(app, config.jwtPublicKey);
  }

  registerContactRoutes(app, contactsService);
  registerListRoutes(app, listsService);

  app.get("/health", { config: { public: true } }, async () => ({
    status: "ok",
    service: "contacts",
  }));

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(statusCode).send({
      success: false,
      error: {
        code: error.name ?? "INTERNAL_ERROR",
        message: statusCode === 500 ? "Internal server error" : error.message,
      },
    });
  });

  return app;
}
