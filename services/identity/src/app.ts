import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { JwtService } from "./utils/jwt.js";
import { AuthService } from "./services/auth.service.js";
import { AccountsService } from "./services/accounts.service.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerAccountRoutes } from "./routes/accounts.routes.js";
import { registerAuthMiddleware } from "./middleware/auth.middleware.js";

export interface AppConfig {
  databaseUrl: string;
  jwtPrivateKeyPem: string;
  jwtPublicKeyPem: string;
  nodeEnv?: string;
  redisUrl?: string;
  runMigrations?: boolean;
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
  });

  await app.register(cors, {
    origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? true,
    credentials: true,
  });

  await app.register(helmet);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  const db = createDb(config.databaseUrl);
  if (config.runMigrations !== false) await runMigrations(db);

  const jwtService = new JwtService({
    privateKeyPem: config.jwtPrivateKeyPem,
    publicKeyPem: config.jwtPublicKeyPem,
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlSeconds: 90 * 24 * 60 * 60,
  });
  await jwtService.initialize();

  const authService = new AuthService(db, jwtService);
  const accountsService = new AccountsService(db);

  registerAuthMiddleware(app, jwtService);
  registerAuthRoutes(app, authService);
  registerAccountRoutes(app, accountsService);

  app.get("/health", { config: { public: true } }, async () => ({
    status: "ok",
    service: "identity",
  }));

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(statusCode).send({
      success: false,
      error: {
        code: error.name ?? "INTERNAL_ERROR",
        message:
          statusCode === 500 ? "Internal server error" : error.message,
      },
    });
  });

  return app;
}
