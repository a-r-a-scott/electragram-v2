import pino from "pino";
import { buildApp } from "./app.js";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

function mustEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function oauthConfigFromEnv(): Record<string, { clientId: string; clientSecret: string }> {
  const providers = ["hubspot", "mailchimp", "salesforce", "google_sheets", "google_oauth"];
  const config: Record<string, { clientId: string; clientSecret: string }> = {};

  for (const provider of providers) {
    const key = provider.toUpperCase().replace(/-/g, "_");
    const clientId = process.env[`OAUTH_${key}_CLIENT_ID`];
    const clientSecret = process.env[`OAUTH_${key}_CLIENT_SECRET`];
    if (clientId && clientSecret) {
      config[provider] = { clientId, clientSecret };
    }
  }
  return config;
}

async function main() {
  const databaseUrl = mustEnv("DATABASE_URL");
  const jwtPublicKey = mustEnv("JWT_PUBLIC_KEY");
  const encryptionKey = mustEnv("ENCRYPTION_KEY");

  const app = await buildApp({
    databaseUrl,
    jwtPublicKey,
    encryptionKey,
    nodeEnv: process.env["NODE_ENV"] ?? "production",
    runMigrations: true,
    baseUrl: process.env["BASE_URL"] ?? "https://api.electragram.io",
    oauthConfig: oauthConfigFromEnv(),
    log,
  });

  const host = process.env["HOST"] ?? "0.0.0.0";
  const port = parseInt(process.env["PORT"] ?? "3000", 10);

  await app.listen({ host, port });
  log.info({ host, port }, "Integrations service listening");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Shutting down");
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
