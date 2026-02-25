import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ListsService } from "../services/lists.service.js";

export function registerListRoutes(app: FastifyInstance, listsService: ListsService): void {
  app.get("/api/contact-lists", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const query = request.query as { page?: string; perPage?: string };
    const result = await listsService.listContactLists(
      claims.accountId,
      parseInt(query.page ?? "1", 10),
      parseInt(query.perPage ?? "25", 10)
    );
    return reply.send({ success: true, data: result });
  });

  app.get("/api/contact-lists/:id", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const { id } = request.params as { id: string };
    const list = await listsService.getContactList(id, claims.accountId);
    return reply.send({ success: true, data: list });
  });

  app.post("/api/contact-lists", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const list = await listsService.createContactList(claims.accountId, request.body as never);
    return reply.code(201).send({ success: true, data: list });
  });

  app.delete("/api/contact-lists/:id", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const { id } = request.params as { id: string };
    await listsService.deleteContactList(id, claims.accountId);
    return reply.code(204).send();
  });

  app.post("/api/contact-lists/:id/members", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const { id } = request.params as { id: string };
    const { contactIds } = request.body as { contactIds: string[] };
    await listsService.addMembers(id, claims.accountId, contactIds);
    return reply.code(204).send();
  });

  app.delete("/api/contact-lists/:id/members/:contactId", async (request, reply) => {
    const claims = (request as FastifyRequest & { jwtClaims: { accountId: string } }).jwtClaims;
    const { id, contactId } = request.params as { id: string; contactId: string };
    await listsService.removeMember(id, claims.accountId, contactId);
    return reply.code(204).send();
  });
}
