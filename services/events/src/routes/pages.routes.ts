import type { FastifyInstance } from "fastify";
import {
  PagesService,
  CreatePageSchema,
  UpdatePageSchema,
} from "../services/pages.service.js";

export async function registerPageRoutes(
  app: FastifyInstance,
  pagesService: PagesService
) {
  app.get<{ Params: { eventId: string } }>(
    "/events/:eventId/pages",
    async (request, reply) => {
      const pages = await pagesService.listPages(request.params.eventId);
      return reply.send({ success: true, data: pages });
    }
  );

  app.post<{ Params: { eventId: string } }>(
    "/events/:eventId/pages",
    async (request, reply) => {
      const input = CreatePageSchema.parse(request.body);
      const page = await pagesService.createPage(request.params.eventId, input);
      return reply.code(201).send({ success: true, data: page });
    }
  );

  app.get<{ Params: { eventId: string; pageId: string } }>(
    "/events/:eventId/pages/:pageId",
    async (request, reply) => {
      const page = await pagesService.getPage(
        request.params.eventId,
        request.params.pageId
      );
      return reply.send({ success: true, data: page });
    }
  );

  app.patch<{ Params: { eventId: string; pageId: string } }>(
    "/events/:eventId/pages/:pageId",
    async (request, reply) => {
      const input = UpdatePageSchema.parse(request.body);
      const page = await pagesService.updatePage(
        request.params.eventId,
        request.params.pageId,
        input
      );
      return reply.send({ success: true, data: page });
    }
  );

  app.post<{ Params: { eventId: string; pageId: string } }>(
    "/events/:eventId/pages/:pageId/publish",
    async (request, reply) => {
      const page = await pagesService.publishPage(
        request.params.eventId,
        request.params.pageId
      );
      return reply.send({ success: true, data: page });
    }
  );

  app.delete<{ Params: { eventId: string; pageId: string } }>(
    "/events/:eventId/pages/:pageId",
    async (request, reply) => {
      await pagesService.deletePage(
        request.params.eventId,
        request.params.pageId
      );
      return reply.code(204).send();
    }
  );

  // Public route — fetch a page by slug for public registration pages
  app.get<{ Params: { slug: string } }>(
    "/public/pages/:slug",
    { config: { public: true } },
    async (request, reply) => {
      const page = await pagesService.getPageBySlug(request.params.slug);
      return reply.send({ success: true, data: page });
    }
  );
}
