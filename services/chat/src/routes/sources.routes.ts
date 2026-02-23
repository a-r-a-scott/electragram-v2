import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SourcesService } from "../services/sources.service.js";
import { NotFoundError, ConflictError } from "../services/errors.js";

const createSchema = z.object({
  channel: z.enum(["sms", "whatsapp"]),
  handle: z.string().min(1),
  credentialId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export function registerSourceRoutes(app: FastifyInstance, sources: SourcesService): void {
  app.get("/chat/sources", async (request, reply) => {
    const rows = await sources.list(request.claims.accountId);
    return reply.send({ success: true, data: rows });
  });

  app.get<{ Params: { id: string } }>("/chat/sources/:id", async (request, reply) => {
    try {
      const row = await sources.getById(request.params.id, request.claims.accountId);
      return reply.send({ success: true, data: row });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
      }
      throw err;
    }
  });

  app.post("/chat/sources", async (request, reply) => {
    try {
      const body = createSchema.parse(request.body);
      const row = await sources.create({ ...body, accountId: request.claims.accountId });
      return reply.code(201).send({ success: true, data: row });
    } catch (err) {
      if (err instanceof ConflictError) {
        return reply.code(409).send({ success: false, error: { code: "CONFLICT", message: (err as Error).message } });
      }
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>("/chat/sources/:id", async (request, reply) => {
    try {
      await sources.deactivate(request.params.id, request.claims.accountId);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
      }
      throw err;
    }
  });
}
