import type { FastifyInstance } from "fastify";
import { BlocksService, CreateBlockSchema, UpdateBlockSchema, ListBlocksQuerySchema } from "../services/blocks.service.js";
import { z } from "zod";

export async function registerBlockRoutes(app: FastifyInstance, svc: BlocksService) {
  app.get("/blocks", async (req, reply) => {
    const query = ListBlocksQuerySchema.parse(req.query);
    const blocks = await svc.list(query.blockableType, query.blockableId);
    return reply.send({ success: true, data: blocks });
  });

  app.post("/blocks", async (req, reply) => {
    const input = CreateBlockSchema.parse(req.body);
    const block = await svc.create(input);
    return reply.code(201).send({ success: true, data: block });
  });

  app.get<{ Params: { blockId: string } }>("/blocks/:blockId", async (req, reply) => {
    const block = await svc.get(req.params.blockId);
    return reply.send({ success: true, data: block });
  });

  app.patch<{ Params: { blockId: string } }>("/blocks/:blockId", async (req, reply) => {
    const input = UpdateBlockSchema.parse(req.body);
    const block = await svc.update(req.params.blockId, input);
    return reply.send({ success: true, data: block });
  });

  app.delete<{ Params: { blockId: string } }>("/blocks/:blockId", async (req, reply) => {
    await svc.delete(req.params.blockId);
    return reply.code(204).send();
  });

  app.post("/blocks/reorder", async (req, reply) => {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);
    await svc.reorder(ids);
    return reply.code(204).send();
  });
}
