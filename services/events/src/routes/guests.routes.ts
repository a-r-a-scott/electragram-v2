import type { FastifyInstance } from "fastify";
import {
  GuestsService,
  CreateGuestSchema,
  UpdateGuestSchema,
  AddGuestToEventSchema,
  BulkAddGuestsSchema,
  CheckInGuestSchema,
  UpdateGuestStatusSchema,
  ListGuestsQuerySchema,
} from "../services/guests.service.js";

export async function registerGuestRoutes(
  app: FastifyInstance,
  guestsService: GuestsService
) {
  // ── Account-level guest registry ─────────────────────────────────────────

  app.get("/guests", async (request, reply) => {
    const query = ListGuestsQuerySchema.parse(request.query);
    const result = await guestsService.listGuests(request.claims.accountId, query);
    return reply.send({ success: true, ...result });
  });

  app.get<{ Params: { guestId: string } }>(
    "/guests/:guestId",
    async (request, reply) => {
      const guest = await guestsService.getGuest(
        request.claims.accountId,
        request.params.guestId
      );
      return reply.send({ success: true, data: guest });
    }
  );

  app.post("/guests", async (request, reply) => {
    const input = CreateGuestSchema.parse(request.body);
    const guest = await guestsService.createGuest(request.claims.accountId, input);
    return reply.code(201).send({ success: true, data: guest });
  });

  app.patch<{ Params: { guestId: string } }>(
    "/guests/:guestId",
    async (request, reply) => {
      const input = UpdateGuestSchema.parse(request.body);
      const guest = await guestsService.updateGuest(
        request.claims.accountId,
        request.params.guestId,
        input
      );
      return reply.send({ success: true, data: guest });
    }
  );

  // ── Event-level guest management ──────────────────────────────────────────

  app.get<{ Params: { eventId: string } }>(
    "/events/:eventId/guests",
    async (request, reply) => {
      const query = ListGuestsQuerySchema.parse(request.query);
      const result = await guestsService.listEventGuests(
        request.claims.accountId,
        request.params.eventId,
        query
      );
      return reply.send({ success: true, ...result });
    }
  );

  app.post<{ Params: { eventId: string } }>(
    "/events/:eventId/guests",
    async (request, reply) => {
      const input = AddGuestToEventSchema.parse(request.body);
      const eventGuest = await guestsService.addGuestToEvent(
        request.claims.accountId,
        request.params.eventId,
        input
      );
      return reply.code(201).send({ success: true, data: eventGuest });
    }
  );

  app.post<{ Params: { eventId: string } }>(
    "/events/:eventId/guests/bulk",
    async (request, reply) => {
      const input = BulkAddGuestsSchema.parse(request.body);
      const result = await guestsService.bulkAddGuests(
        request.claims.accountId,
        request.params.eventId,
        input
      );
      return reply.send({ success: true, data: result });
    }
  );

  app.delete<{ Params: { eventId: string; eventGuestId: string } }>(
    "/events/:eventId/guests/:eventGuestId",
    async (request, reply) => {
      await guestsService.removeGuestFromEvent(
        request.claims.accountId,
        request.params.eventId,
        request.params.eventGuestId
      );
      return reply.code(204).send();
    }
  );

  app.patch<{ Params: { eventId: string; eventGuestId: string } }>(
    "/events/:eventId/guests/:eventGuestId/status",
    async (request, reply) => {
      const input = UpdateGuestStatusSchema.parse(request.body);
      const eventGuest = await guestsService.updateGuestStatus(
        request.claims.accountId,
        request.params.eventId,
        request.params.eventGuestId,
        input
      );
      return reply.send({ success: true, data: eventGuest });
    }
  );

  app.post<{ Params: { eventId: string; eventGuestId: string } }>(
    "/events/:eventId/guests/:eventGuestId/check-in",
    async (request, reply) => {
      const input = CheckInGuestSchema.parse(request.body ?? {});
      const eventGuest = await guestsService.checkIn(
        request.claims.accountId,
        request.params.eventId,
        request.params.eventGuestId,
        input
      );
      return reply.send({ success: true, data: eventGuest });
    }
  );
}
