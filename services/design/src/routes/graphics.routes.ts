import type { FastifyInstance } from "fastify";
import {
  GraphicsService,
  CreateGraphicSchema,
  UpdateGraphicSchema,
  ListGraphicsQuerySchema,
} from "../services/graphics.service.js";

export async function registerGraphicRoutes(app: FastifyInstance, svc: GraphicsService) {
  app.get("/graphics", async (req, reply) => {
    const query = ListGraphicsQuerySchema.parse(req.query);
    const result = await svc.list(query);
    return reply.send({ success: true, ...result });
  });

  app.post("/graphics", async (req, reply) => {
    const input = CreateGraphicSchema.parse(req.body);
    const graphic = await svc.create(input);
    return reply.code(201).send({ success: true, data: graphic });
  });

  app.get<{ Params: { graphicId: string } }>("/graphics/:graphicId", async (req, reply) => {
    const graphic = await svc.get(req.params.graphicId);
    return reply.send({ success: true, data: graphic });
  });

  app.patch<{ Params: { graphicId: string } }>("/graphics/:graphicId", async (req, reply) => {
    const input = UpdateGraphicSchema.parse(req.body);
    const graphic = await svc.update(req.params.graphicId, input);
    return reply.send({ success: true, data: graphic });
  });

  app.delete<{ Params: { graphicId: string } }>("/graphics/:graphicId", async (req, reply) => {
    await svc.delete(req.params.graphicId);
    return reply.code(204).send();
  });
}
