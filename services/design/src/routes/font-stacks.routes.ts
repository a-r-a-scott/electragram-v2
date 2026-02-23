import type { FastifyInstance } from "fastify";
import {
  FontStacksService,
  CreateFontStackSchema,
  UpdateFontStackSchema,
  ListFontStacksQuerySchema,
} from "../services/font-stacks.service.js";

export async function registerFontStackRoutes(app: FastifyInstance, svc: FontStacksService) {
  app.get("/font-stacks", async (req, reply) => {
    const query = ListFontStacksQuerySchema.parse(req.query);
    const result = await svc.list(query);
    return reply.send({ success: true, ...result });
  });

  app.post("/font-stacks", async (req, reply) => {
    const input = CreateFontStackSchema.parse(req.body);
    const stack = await svc.create(input);
    return reply.code(201).send({ success: true, data: stack });
  });

  app.get<{ Params: { stackId: string } }>("/font-stacks/:stackId", async (req, reply) => {
    const stack = await svc.get(req.params.stackId);
    return reply.send({ success: true, data: stack });
  });

  app.patch<{ Params: { stackId: string } }>("/font-stacks/:stackId", async (req, reply) => {
    const input = UpdateFontStackSchema.parse(req.body);
    const stack = await svc.update(req.params.stackId, input);
    return reply.send({ success: true, data: stack });
  });

  app.delete<{ Params: { stackId: string } }>("/font-stacks/:stackId", async (req, reply) => {
    await svc.delete(req.params.stackId);
    return reply.code(204).send();
  });
}
