import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createAuthMiddleware } from "./middleware/auth.middleware.js";
import { SnapshotsService } from "./services/snapshots.service.js";
import { ActivitiesService } from "./services/activities.service.js";
import { registerSnapshotRoutes } from "./routes/snapshots.routes.js";
import { registerActivityRoutes } from "./routes/activities.routes.js";

export interface AppConfig {
  databaseUrl: string;
  nodeEnv?: string;
  jwtPublicKey?: string;
  runMigrations?: boolean;
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.nodeEnv !== "test" });

  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });

  const db = createDb(config.databaseUrl);
  if (config.runMigrations) await runMigrations(db);

  const snapshotsService = new SnapshotsService(db);
  const activitiesService = new ActivitiesService(db);

  const authMiddleware = createAuthMiddleware(config.jwtPublicKey ?? "test-key");
  app.addHook("preHandler", authMiddleware);

  app.get("/health", { config: { public: true } }, async () => ({
    status: "ok",
    service: "analytics",
  }));

  registerSnapshotRoutes(app, snapshotsService);
  registerActivityRoutes(app, activitiesService);

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
