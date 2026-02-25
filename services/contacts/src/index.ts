import { buildApp } from "./app.js";
import { closeDb } from "./db/client.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = await buildApp({
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtPublicKey: process.env.JWT_PUBLIC_KEY ?? "",
  nodeEnv: process.env.NODE_ENV ?? "production",
  runMigrations: process.env.RUN_MIGRATIONS !== "false",
});

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
