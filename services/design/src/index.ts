import { buildApp } from "./app.js";

async function main() {
  const app = await buildApp({
    databaseUrl: process.env["DATABASE_URL"] ?? "",
    nodeEnv: process.env["NODE_ENV"] ?? "production",
  });
  const port = parseInt(process.env["PORT"] ?? "3009", 10);
  await app.listen({ port, host: "0.0.0.0" });
}
main().catch((err) => { console.error(err); process.exit(1); });
