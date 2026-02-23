import type { FastifyInstance } from "fastify";
import {
  ThemesService,
  CreateThemeSchema,
  UpdateThemeSchema,
  ListThemesQuerySchema,
} from "../services/themes.service.js";

export async function registerThemeRoutes(app: FastifyInstance, svc: ThemesService) {
  app.get("/themes", async (req, reply) => {
    const query = ListThemesQuerySchema.parse(req.query);
    const result = await svc.list(req.claims.accountId, query);
    return reply.send({ success: true, ...result });
  });

  app.post("/themes", async (req, reply) => {
    const input = CreateThemeSchema.parse(req.body);
    const theme = await svc.create(req.claims.accountId, input);
    return reply.code(201).send({ success: true, data: theme });
  });

  app.get<{ Params: { themeId: string } }>("/themes/:themeId", async (req, reply) => {
    const theme = await svc.get(req.params.themeId);
    return reply.send({ success: true, data: theme });
  });

  app.patch<{ Params: { themeId: string } }>("/themes/:themeId", async (req, reply) => {
    const input = UpdateThemeSchema.parse(req.body);
    const theme = await svc.update(req.params.themeId, input);
    return reply.send({ success: true, data: theme });
  });

  app.post<{ Params: { themeId: string } }>("/themes/:themeId/publish", async (req, reply) => {
    const theme = await svc.publish(req.params.themeId);
    return reply.send({ success: true, data: theme });
  });

  app.post<{ Params: { themeId: string } }>("/themes/:themeId/archive", async (req, reply) => {
    await svc.archive(req.params.themeId);
    return reply.code(204).send();
  });

  app.delete<{ Params: { themeId: string } }>("/themes/:themeId", async (req, reply) => {
    await svc.delete(req.params.themeId);
    return reply.code(204).send();
  });
}
