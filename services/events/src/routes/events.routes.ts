import type { FastifyInstance } from "fastify";
import {
  EventsService,
  CreateEventSchema,
  UpdateEventSchema,
  ListEventsQuerySchema,
} from "../services/events.service.js";

export async function registerEventRoutes(
  app: FastifyInstance,
  eventsService: EventsService
) {
  app.get("/events", async (request, reply) => {
    const query = ListEventsQuerySchema.parse(request.query);
    const result = await eventsService.listEvents(
      request.claims.accountId,
      query
    );
    return reply.send({ success: true, ...result });
  });

  app.post("/events", async (request, reply) => {
    const input = CreateEventSchema.parse(request.body);
    const event = await eventsService.createEvent(
      request.claims.accountId,
      input
    );
    return reply.code(201).send({ success: true, data: event });
  });

  app.get<{ Params: { eventId: string } }>(
    "/events/:eventId",
    async (request, reply) => {
      const event = await eventsService.getEvent(
        request.claims.accountId,
        request.params.eventId
      );
      return reply.send({ success: true, data: event });
    }
  );

  app.patch<{ Params: { eventId: string } }>(
    "/events/:eventId",
    async (request, reply) => {
      const input = UpdateEventSchema.parse(request.body);
      const event = await eventsService.updateEvent(
        request.claims.accountId,
        request.params.eventId,
        input
      );
      return reply.send({ success: true, data: event });
    }
  );

  app.delete<{ Params: { eventId: string } }>(
    "/events/:eventId",
    async (request, reply) => {
      await eventsService.archiveEvent(
        request.claims.accountId,
        request.params.eventId
      );
      return reply.code(204).send();
    }
  );
}
