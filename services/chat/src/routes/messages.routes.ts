import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConversationsService } from "../services/conversations.service.js";
import type { MessagesService } from "../services/messages.service.js";
import { NotFoundError } from "../services/errors.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const sendSchema = z.object({
  content: z.string().min(1).max(1600),
  fromHandle: z.string().min(1),
});

export function registerMessageRoutes(
  app: FastifyInstance,
  conversations: ConversationsService,
  messages: MessagesService,
): void {
  /** GET /chat/conversations/:id/messages */
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/chat/conversations/:id/messages",
    async (request, reply) => {
      try {
        await conversations.getById(request.params.id, request.claims.accountId);
        const { limit } = listQuerySchema.parse(request.query);
        const rows = await messages.list(request.params.id, limit);
        return reply.send({ success: true, data: rows });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
        }
        throw err;
      }
    },
  );

  /** POST /chat/conversations/:id/messages — send an outbound reply */
  app.post<{ Params: { id: string } }>(
    "/chat/conversations/:id/messages",
    async (request, reply) => {
      try {
        const conversation = await conversations.getById(request.params.id, request.claims.accountId);
        const { content, fromHandle } = sendSchema.parse(request.body);

        const message = await messages.sendOutbound({
          conversationId: conversation.id,
          fromHandle,
          toHandle: conversation.handle,
          channel: conversation.channel,
          content,
        });

        return reply.code(201).send({ success: true, data: message });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
        }
        throw err;
      }
    },
  );
}
