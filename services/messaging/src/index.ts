import { buildApp } from "./app.js";
import { closeDb } from "./db/client.js";

const PORT = parseInt(process.env.PORT ?? "3003", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

const cfg: Parameters<typeof buildApp>[0] = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://localhost:5432/electragram_messaging",
  jwtPublicKey: process.env.JWT_PUBLIC_KEY ?? "",
  nodeEnv: process.env.NODE_ENV ?? "production",
  runMigrations: process.env.RUN_MIGRATIONS === "true",
};
if (process.env.SQS_QUEUE_URL) cfg.sqsQueueUrl = process.env.SQS_QUEUE_URL;
if (process.env.AWS_REGION) cfg.sqsRegion = process.env.AWS_REGION;
if (process.env.SQS_ENDPOINT) cfg.sqsEndpoint = process.env.SQS_ENDPOINT;

const app = await buildApp(cfg);

const shutdown = async () => {
  await app.close();
  await closeDb();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
