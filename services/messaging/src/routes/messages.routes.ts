import type { FastifyInstance } from "fastify";
import {
  MessagesService,
  CreateMessageSchema,
  UpdateMessageSchema,
  ScheduleMessageSchema,
  SetRecipientsSchema,
  ListMessagesQuerySchema,
} from "../services/messages.service.js";

export async function registerMessageRoutes(
  app: FastifyInstance,
  messagesService: MessagesService
) {
  app.get("/messages", async (request, reply) => {
    const query = ListMessagesQuerySchema.parse(request.query);
    const result = await messagesService.listMessages(request.claims.accountId, query);
    return reply.send({ success: true, ...result });
  });

  app.post("/messages", async (request, reply) => {
    const input = CreateMessageSchema.parse(request.body);
    const message = await messagesService.createMessage(request.claims.accountId, input);
    return reply.code(201).send({ success: true, data: message });
  });

  app.get<{ Params: { messageId: string } }>(
    "/messages/:messageId",
    async (request, reply) => {
      const message = await messagesService.getMessage(
        request.claims.accountId,
        request.params.messageId
      );
      return reply.send({ success: true, data: message });
    }
  );

  app.patch<{ Params: { messageId: string } }>(
    "/messages/:messageId",
    async (request, reply) => {
      const input = UpdateMessageSchema.parse(request.body);
      const message = await messagesService.updateMessage(
        request.claims.accountId,
        request.params.messageId,
        input
      );
      return reply.send({ success: true, data: message });
    }
  );

  app.put<{ Params: { messageId: string } }>(
    "/messages/:messageId/recipients",
    async (request, reply) => {
      const input = SetRecipientsSchema.parse(request.body);
      const result = await messagesService.setRecipients(
        request.claims.accountId,
        request.params.messageId,
        input
      );
      return reply.send({ success: true, data: result });
    }
  );

  app.get<{ Params: { messageId: string }; Querystring: { page?: string; perPage?: string } }>(
    "/messages/:messageId/recipients",
    async (request, reply) => {
      const page = parseInt(request.query.page ?? "1", 10);
      const perPage = parseInt(request.query.perPage ?? "50", 10);
      const result = await messagesService.listRecipients(
        request.claims.accountId,
        request.params.messageId,
        page,
        perPage
      );
      return reply.send({ success: true, ...result });
    }
  );

  app.post<{ Params: { messageId: string } }>(
    "/messages/:messageId/schedule",
    async (request, reply) => {
      const input = ScheduleMessageSchema.parse(request.body);
      const message = await messagesService.scheduleMessage(
        request.claims.accountId,
        request.params.messageId,
        input
      );
      return reply.send({ success: true, data: message });
    }
  );

  app.post<{ Params: { messageId: string } }>(
    "/messages/:messageId/dispatch",
    async (request, reply) => {
      const result = await messagesService.dispatch(
        request.claims.accountId,
        request.params.messageId
      );
      return reply.send({ success: true, data: result });
    }
  );

  app.post<{ Params: { messageId: string } }>(
    "/messages/:messageId/cancel",
    async (request, reply) => {
      const message = await messagesService.cancelMessage(
        request.claims.accountId,
        request.params.messageId
      );
      return reply.send({ success: true, data: message });
    }
  );

  app.delete<{ Params: { messageId: string } }>(
    "/messages/:messageId",
    async (request, reply) => {
      await messagesService.deleteMessage(
        request.claims.accountId,
        request.params.messageId
      );
      return reply.code(204).send();
    }
  );
}
