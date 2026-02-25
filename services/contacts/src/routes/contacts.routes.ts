import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ContactsService } from "../services/contacts.service.js";

export function registerContactRoutes(app: FastifyInstance, contactsService: ContactsService): void {
  app.get("/api/contacts", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const query = request.query as { page?: string; perPage?: string; q?: string; status?: string };
    const result = await contactsService.listContacts(claims.accountId, {
      page: parseInt(query.page ?? "1", 10),
      perPage: parseInt(query.perPage ?? "25", 10),
      q: query.q,
      status: query.status as never,
    });
    return reply.send({ success: true, data: result });
  });

  app.get("/api/contacts/:id", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const { id } = request.params as { id: string };
    const contact = await contactsService.getContact(id, claims.accountId);
    return reply.send({ success: true, data: contact });
  });

  app.post("/api/contacts", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const contact = await contactsService.createContact(claims.accountId, request.body as never);
    return reply.code(201).send({ success: true, data: contact });
  });

  app.patch("/api/contacts/:id", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const { id } = request.params as { id: string };
    const contact = await contactsService.updateContact(id, claims.accountId, request.body as never);
    return reply.send({ success: true, data: contact });
  });

  app.delete("/api/contacts/:id", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const { id } = request.params as { id: string };
    await contactsService.deleteContact(id, claims.accountId);
    return reply.code(204).send();
  });
}
