import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createAuthMiddleware } from "./middleware/auth.middleware.js";
import { CredentialsService } from "./services/credentials.service.js";
import { AccountIntegrationsService } from "./services/account-integrations.service.js";
import { ProviderRefsService } from "./services/provider-refs.service.js";
import { SyncService } from "./services/sync.service.js";
import type { ContactsImporter } from "./services/sync.service.js";
import { registerIntegrationRoutes } from "./routes/integrations.routes.js";
import { registerOAuthRoutes } from "./routes/oauth.routes.js";
import { registerSyncRoutes } from "./routes/sync.routes.js";
import type { Logger } from "pino";

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
}

export interface AppConfig {
  databaseUrl: string;
  nodeEnv?: string;
  jwtPublicKey?: string;
  runMigrations?: boolean;
  encryptionKey?: string;
  baseUrl?: string;
  oauthConfig?: Record<string, OAuthProviderConfig>;
  contactsImporter?: ContactsImporter;
  log?: Logger;
}

const STUB_CONTACTS_IMPORTER: ContactsImporter = {
  async upsert(_params) { return { id: "stub" }; },
};

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.nodeEnv !== "test" });

  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });

  const db = createDb(config.databaseUrl);
  if (config.runMigrations) await runMigrations(db);

  const encryptionKey = config.encryptionKey ?? "0".repeat(64); // dev/test default
  const credentialsService = new CredentialsService(db, encryptionKey);
  const accountIntegrationsService = new AccountIntegrationsService(db);
  const providerRefsService = new ProviderRefsService(db);

  const contactsImporter = config.contactsImporter ?? STUB_CONTACTS_IMPORTER;
  const log = config.log ?? app.log as unknown as Logger;

  const syncService = new SyncService(
    credentialsService,
    accountIntegrationsService,
    providerRefsService,
    contactsImporter,
    log,
  );

  const authMiddleware = createAuthMiddleware(config.jwtPublicKey ?? "test-key");
  app.addHook("preHandler", authMiddleware);

  app.get("/health", { config: { public: true } }, async () => ({
    status: "ok",
    service: "integrations",
  }));

  registerIntegrationRoutes(app, accountIntegrationsService);
  registerOAuthRoutes(
    app,
    db,
    credentialsService,
    accountIntegrationsService,
    config.oauthConfig ?? {},
    config.baseUrl ?? "https://api.electragram.io",
  );
  registerSyncRoutes(app, syncService, accountIntegrationsService);

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
