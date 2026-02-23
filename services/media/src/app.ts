import Fastify from "fastify";

export interface AppConfig {
  databaseUrl: string;
  nodeEnv?: string;
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.nodeEnv !== "test" });

  app.get("/health", { config: { public: true } }, async () => ({
    status: "ok",
    service: "media",
  }));

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(statusCode).send({
      success: false,
      error: { code: error.name ?? "INTERNAL_ERROR", message: statusCode === 500 ? "Internal server error" : error.message },
    });
  });

  return app;
}
