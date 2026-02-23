import type { FastifyInstance } from "fastify";
import { LayersService, CreateLayerSchema, UpdateLayerSchema } from "../services/layers.service.js";

export async function registerLayerRoutes(app: FastifyInstance, svc: LayersService) {
  type TemplateParam = { templateId: string };
  type LayerParam = { templateId: string; layerId: string };

  app.get<{ Params: TemplateParam }>(
    "/themes/:themeId/templates/:templateId/layers",
    async (req, reply) => {
      const layers = await svc.list(req.params.templateId);
      return reply.send({ success: true, data: layers });
    }
  );

  app.post<{ Params: TemplateParam }>(
    "/themes/:themeId/templates/:templateId/layers",
    async (req, reply) => {
      const input = CreateLayerSchema.parse(req.body);
      const layer = await svc.create(req.params.templateId, input);
      return reply.code(201).send({ success: true, data: layer });
    }
  );

  app.get<{ Params: LayerParam }>(
    "/themes/:themeId/templates/:templateId/layers/:layerId",
    async (req, reply) => {
      const layer = await svc.get(req.params.templateId, req.params.layerId);
      return reply.send({ success: true, data: layer });
    }
  );

  app.patch<{ Params: LayerParam }>(
    "/themes/:themeId/templates/:templateId/layers/:layerId",
    async (req, reply) => {
      const input = UpdateLayerSchema.parse(req.body);
      const layer = await svc.update(req.params.templateId, req.params.layerId, input);
      return reply.send({ success: true, data: layer });
    }
  );

  app.delete<{ Params: LayerParam }>(
    "/themes/:themeId/templates/:templateId/layers/:layerId",
    async (req, reply) => {
      await svc.delete(req.params.templateId, req.params.layerId);
      return reply.code(204).send();
    }
  );
}
