import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConversationsService } from "../services/conversations.service.js";
import { NotFoundError } from "../services/errors.js";

const listQuerySchema = z.object({
  status: z.enum(["open", "resolved", "opted_out"]).optional(),
  unreadOnly: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["open", "resolved", "opted_out"]),
});

export function registerConversationRoutes(
  app: FastifyInstance,
  conversations: ConversationsService,
): void {
  app.get<{ Querystring: Record<string, string> }>("/chat/conversations", async (request, reply) => {
    const opts = listQuerySchema.parse(request.query);
    const rows = await conversations.list({
      accountId: request.claims.accountId,
      ...opts,
    });
    return reply.send({ success: true, data: rows });
  });

  app.get<{ Params: { id: string } }>("/chat/conversations/:id", async (request, reply) => {
    try {
      const row = await conversations.getById(request.params.id, request.claims.accountId);
      return reply.send({ success: true, data: row });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string } }>("/chat/conversations/:id/status", async (request, reply) => {
    try {
      const { status } = updateStatusSchema.parse(request.body);
      const row = await conversations.updateStatus(request.params.id, request.claims.accountId, status);
      return reply.send({ success: true, data: row });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>("/chat/conversations/:id/read", async (request, reply) => {
    try {
      await conversations.markRead(request.params.id, request.claims.accountId);
      return reply.send({ success: true });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
      }
      throw err;
    }
  });
}
