import { buildApp } from "./app.js";

const PORT = parseInt(process.env.PORT ?? "3009", 10);

const app = await buildApp({
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtPublicKey: process.env.JWT_PUBLIC_KEY ?? "",
  nodeEnv: process.env.NODE_ENV ?? "production",
  runMigrations: process.env.RUN_MIGRATIONS !== "false",
});

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
