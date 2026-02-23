import { buildApp } from "./app.js";

async function main() {
  const config = {
    databaseUrl: process.env["DATABASE_URL"] ?? "",
    jwtPrivateKeyPem: process.env["JWT_PRIVATE_KEY"]?.replace(/\\n/g, "\n") ?? "",
    jwtPublicKeyPem: process.env["JWT_PUBLIC_KEY"]?.replace(/\\n/g, "\n") ?? "",
    nodeEnv: process.env["NODE_ENV"] ?? "development",
    redisUrl: process.env["REDIS_URL"],
  };

  if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
  if (!config.jwtPrivateKeyPem) throw new Error("JWT_PRIVATE_KEY is required");
  if (!config.jwtPublicKeyPem) throw new Error("JWT_PUBLIC_KEY is required");

  const app = await buildApp(config);
  const port = parseInt(process.env["PORT"] ?? "3001", 10);

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Identity service listening on port ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
