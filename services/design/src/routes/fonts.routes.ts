import type { FastifyInstance } from "fastify";
import {
  FontsService,
  CreateFontSchema,
  UpdateFontSchema,
  ListFontsQuerySchema,
} from "../services/fonts.service.js";

export async function registerFontRoutes(app: FastifyInstance, svc: FontsService) {
  app.get("/fonts", async (req, reply) => {
    const query = ListFontsQuerySchema.parse(req.query);
    const result = await svc.list(req.claims.accountId, query);
    return reply.send({ success: true, ...result });
  });

  app.post("/fonts", async (req, reply) => {
    const input = CreateFontSchema.parse(req.body);
    const font = await svc.create(req.claims.accountId, input);
    return reply.code(201).send({ success: true, data: font });
  });

  app.get<{ Params: { fontId: string } }>("/fonts/:fontId", async (req, reply) => {
    const font = await svc.get(req.params.fontId);
    return reply.send({ success: true, data: font });
  });

  app.patch<{ Params: { fontId: string } }>("/fonts/:fontId", async (req, reply) => {
    const input = UpdateFontSchema.parse(req.body);
    const font = await svc.update(req.params.fontId, input);
    return reply.send({ success: true, data: font });
  });

  app.delete<{ Params: { fontId: string } }>("/fonts/:fontId", async (req, reply) => {
    await svc.delete(req.params.fontId);
    return reply.code(204).send();
  });
}
