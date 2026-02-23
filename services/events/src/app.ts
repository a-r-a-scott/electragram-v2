import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createAuthMiddleware } from "./middleware/auth.middleware.js";
import { EventsService } from "./services/events.service.js";
import { GuestsService } from "./services/guests.service.js";
import { FormsService } from "./services/forms.service.js";
import { PagesService } from "./services/pages.service.js";
import { registerEventRoutes } from "./routes/events.routes.js";
import { registerGuestRoutes } from "./routes/guests.routes.js";
import { registerFormRoutes } from "./routes/forms.routes.js";
import { registerPageRoutes } from "./routes/pages.routes.js";

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

  const db = createDb(config.databaseUrl);
  if (config.runMigrations) await runMigrations(db);

  const eventsService = new EventsService(db);
  const guestsService = new GuestsService(db);
  const formsService = new FormsService(db);
  const pagesService = new PagesService(db);

  const authMiddleware = createAuthMiddleware(
    config.jwtPublicKey ?? "test-key"
  );
  app.addHook("preHandler", authMiddleware);

  app.get("/health", { config: { public: true } }, async () => ({
    status: "ok",
    service: "events",
  }));

  await registerEventRoutes(app, eventsService);
  await registerGuestRoutes(app, guestsService);
  await registerFormRoutes(app, formsService);
  await registerPageRoutes(app, pagesService);

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
