import { buildApp } from "./app.js";

async function main() {
  const jwtPrivateKeyPem = (process.env["JWT_PRIVATE_KEY"] ?? "").replace(/\\n/g, "\n");
  const jwtPublicKeyPem  = (process.env["JWT_PUBLIC_KEY"]  ?? "").replace(/\\n/g, "\n");

  if (!process.env["DATABASE_URL"]) throw new Error("DATABASE_URL is required");
  if (!jwtPrivateKeyPem) throw new Error("JWT_PRIVATE_KEY is required");
  if (!jwtPublicKeyPem)  throw new Error("JWT_PUBLIC_KEY is required");

  const app = await buildApp({
    databaseUrl:     process.env["DATABASE_URL"],
    jwtPrivateKeyPem,
    jwtPublicKeyPem,
    nodeEnv:         process.env["NODE_ENV"] ?? "development",
    redisUrl:        process.env["REDIS_URL"],
    runMigrations:   process.env["RUN_MIGRATIONS"] !== "false",
  });

  const port = parseInt(process.env["PORT"] ?? "3001", 10);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Identity service listening on port ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
