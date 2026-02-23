import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createAuthMiddleware } from "./middleware/auth.middleware.js";

import { ThemesService } from "./services/themes.service.js";
import { TemplatesService } from "./services/templates.service.js";
import { LayersService } from "./services/layers.service.js";
import { ColorPalettesService } from "./services/color-palettes.service.js";
import { FontStacksService } from "./services/font-stacks.service.js";
import { FontsService } from "./services/fonts.service.js";
import { GraphicsService } from "./services/graphics.service.js";
import { BlocksService } from "./services/blocks.service.js";
import { RendererService } from "./services/renderer.service.js";

import { registerThemeRoutes } from "./routes/themes.routes.js";
import { registerTemplateRoutes } from "./routes/templates.routes.js";
import { registerLayerRoutes } from "./routes/layers.routes.js";
import { registerColorPaletteRoutes } from "./routes/color-palettes.routes.js";
import { registerFontStackRoutes } from "./routes/font-stacks.routes.js";
import { registerFontRoutes } from "./routes/fonts.routes.js";
import { registerGraphicRoutes } from "./routes/graphics.routes.js";
import { registerBlockRoutes } from "./routes/blocks.routes.js";

export interface AppConfig {
  databaseUrl: string;
  jwtPublicKey?: string;
  nodeEnv?: string;
  runMigrations?: boolean;
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.nodeEnv !== "test" });

  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });

  const db = createDb(config.databaseUrl);
  if (config.runMigrations) await runMigrations(db);

  // ── Services ──────────────────────────────────────────────────────────────
  const themesService = new ThemesService(db);
  const templatesService = new TemplatesService(db);
  const layersService = new LayersService(db);
  const colorPalettesService = new ColorPalettesService(db);
  const fontStacksService = new FontStacksService(db);
  const fontsService = new FontsService(db);
  const graphicsService = new GraphicsService(db);
  const blocksService = new BlocksService(db);
  const rendererService = new RendererService(db);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authMiddleware = createAuthMiddleware(config.jwtPublicKey ?? "test-key");
  app.addHook("preHandler", authMiddleware);

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/health", { config: { public: true } }, async () => ({
    status: "ok",
    service: "design",
  }));

  // ── Routes ────────────────────────────────────────────────────────────────
  await registerThemeRoutes(app, themesService);
  await registerTemplateRoutes(app, templatesService, rendererService);
  await registerLayerRoutes(app, layersService);
  await registerColorPaletteRoutes(app, colorPalettesService);
  await registerFontStackRoutes(app, fontStacksService);
  await registerFontRoutes(app, fontsService);
  await registerGraphicRoutes(app, graphicsService);
  await registerBlockRoutes(app, blocksService);

  // ── Error handler ─────────────────────────────────────────────────────────
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const isServer = statusCode >= 500;
    if (isServer) app.log.error({ err: error }, "Request error");
    return reply.code(statusCode).send({
      success: false,
      error: {
        code: error.name ?? "INTERNAL_ERROR",
        message: isServer ? "Internal server error" : error.message,
      },
    });
  });

  return app;
}
