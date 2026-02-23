import type { FastifyInstance } from "fastify";
import {
  TemplatesService,
  CreateTemplateSchema,
  UpdateTemplateSchema,
  ListTemplatesQuerySchema,
} from "../services/templates.service.js";

export async function registerTemplateRoutes(
  app: FastifyInstance,
  templatesService: TemplatesService
) {
  app.get("/templates", async (request, reply) => {
    const query = ListTemplatesQuerySchema.parse(request.query);
    const result = await templatesService.listTemplates(request.claims.accountId, query);
    return reply.send({ success: true, ...result });
  });

  app.post("/templates", async (request, reply) => {
    const input = CreateTemplateSchema.parse(request.body);
    const template = await templatesService.createTemplate(request.claims.accountId, input);
    return reply.code(201).send({ success: true, data: template });
  });

  app.get<{ Params: { templateId: string } }>(
    "/templates/:templateId",
    async (request, reply) => {
      const template = await templatesService.getTemplate(
        request.claims.accountId,
        request.params.templateId
      );
      return reply.send({ success: true, data: template });
    }
  );

  app.patch<{ Params: { templateId: string } }>(
    "/templates/:templateId",
    async (request, reply) => {
      const input = UpdateTemplateSchema.parse(request.body);
      const template = await templatesService.updateTemplate(
        request.claims.accountId,
        request.params.templateId,
        input
      );
      return reply.send({ success: true, data: template });
    }
  );

  app.post<{ Params: { templateId: string } }>(
    "/templates/:templateId/publish",
    async (request, reply) => {
      const template = await templatesService.publishTemplate(
        request.claims.accountId,
        request.params.templateId
      );
      return reply.send({ success: true, data: template });
    }
  );

  app.post<{ Params: { templateId: string } }>(
    "/templates/:templateId/archive",
    async (request, reply) => {
      await templatesService.archiveTemplate(
        request.claims.accountId,
        request.params.templateId
      );
      return reply.code(204).send();
    }
  );

  app.delete<{ Params: { templateId: string } }>(
    "/templates/:templateId",
    async (request, reply) => {
      await templatesService.deleteTemplate(
        request.claims.accountId,
        request.params.templateId
      );
      return reply.code(204).send();
    }
  );
}
