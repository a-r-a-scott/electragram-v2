import type { FastifyInstance } from "fastify";
import {
  TemplatesService,
  CreateTemplateSchema,
  UpdateTemplateSchema,
  ListTemplatesQuerySchema,
} from "../services/templates.service.js";
import { RendererService, RenderTemplateSchema } from "../services/renderer.service.js";

export async function registerTemplateRoutes(
  app: FastifyInstance,
  svc: TemplatesService,
  renderer: RendererService
) {
  type ThemeParam = { themeId: string };
  type ThemeTemplateParam = { themeId: string; templateId: string };

  app.get<{ Params: ThemeParam }>("/themes/:themeId/templates", async (req, reply) => {
    const query = ListTemplatesQuerySchema.parse(req.query);
    const result = await svc.list(req.params.themeId, query);
    return reply.send({ success: true, ...result });
  });

  app.post<{ Params: ThemeParam }>("/themes/:themeId/templates", async (req, reply) => {
    const input = CreateTemplateSchema.parse(req.body);
    const template = await svc.create(req.params.themeId, input);
    return reply.code(201).send({ success: true, data: template });
  });

  app.get<{ Params: ThemeTemplateParam }>(
    "/themes/:themeId/templates/:templateId",
    async (req, reply) => {
      const template = await svc.get(req.params.themeId, req.params.templateId);
      return reply.send({ success: true, data: template });
    }
  );

  app.patch<{ Params: ThemeTemplateParam }>(
    "/themes/:themeId/templates/:templateId",
    async (req, reply) => {
      const input = UpdateTemplateSchema.parse(req.body);
      const template = await svc.update(req.params.themeId, req.params.templateId, input);
      return reply.send({ success: true, data: template });
    }
  );

  app.post<{ Params: ThemeTemplateParam }>(
    "/themes/:themeId/templates/:templateId/publish",
    async (req, reply) => {
      const template = await svc.publish(req.params.themeId, req.params.templateId);
      return reply.send({ success: true, data: template });
    }
  );

  app.post<{ Params: ThemeTemplateParam }>(
    "/themes/:themeId/templates/:templateId/archive",
    async (req, reply) => {
      await svc.archive(req.params.themeId, req.params.templateId);
      return reply.code(204).send();
    }
  );

  app.delete<{ Params: ThemeTemplateParam }>(
    "/themes/:themeId/templates/:templateId",
    async (req, reply) => {
      await svc.delete(req.params.themeId, req.params.templateId);
      return reply.code(204).send();
    }
  );

  /**
   * POST /themes/:themeId/templates/:templateId/render
   *
   * Render a template as production-ready email HTML.
   * Called by the Delivery service just before sending each message.
   */
  app.post<{ Params: ThemeTemplateParam }>(
    "/themes/:themeId/templates/:templateId/render",
    async (req, reply) => {
      const input = RenderTemplateSchema.parse(req.body);
      const result = await renderer.render(req.params.templateId, input);
      return reply.send({ success: true, data: result });
    }
  );

  /**
   * POST /templates/:templateId/render
   *
   * Convenience route for the Delivery service — does not require the themeId.
   * The templateId is globally unique so the theme context is loaded automatically.
   */
  app.post<{ Params: { templateId: string } }>(
    "/templates/:templateId/render",
    async (req, reply) => {
      const input = RenderTemplateSchema.parse(req.body);
      const result = await renderer.render(req.params.templateId, input);
      return reply.send({ success: true, data: result });
    }
  );
}
