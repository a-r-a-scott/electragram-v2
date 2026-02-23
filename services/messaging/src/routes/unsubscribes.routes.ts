import type { FastifyInstance } from "fastify";
import {
  UnsubscribesService,
  CreateUnsubscribeSchema,
  ListUnsubscribesQuerySchema,
} from "../services/unsubscribes.service.js";

export async function registerUnsubscribeRoutes(
  app: FastifyInstance,
  unsubscribesService: UnsubscribesService
) {
  app.get("/unsubscribes", async (request, reply) => {
    const query = ListUnsubscribesQuerySchema.parse(request.query);
    const result = await unsubscribesService.listUnsubscribes(
      request.claims.accountId,
      query
    );
    return reply.send({ success: true, ...result });
  });

  app.post("/unsubscribes", async (request, reply) => {
    const input = CreateUnsubscribeSchema.parse(request.body);
    const record = await unsubscribesService.createUnsubscribe(
      request.claims.accountId,
      input
    );
    return reply.code(201).send({ success: true, data: record });
  });

  app.delete<{ Params: { unsubscribeId: string } }>(
    "/unsubscribes/:unsubscribeId",
    async (request, reply) => {
      await unsubscribesService.deleteUnsubscribe(
        request.claims.accountId,
        request.params.unsubscribeId
      );
      return reply.code(204).send();
    }
  );

  // Public one-click unsubscribe used by email links — no auth required
  app.post<{ Querystring: { token: string; email: string; messageId?: string } }>(
    "/public/unsubscribe",
    { config: { public: true } },
    async (request, reply) => {
      const { email, messageId } = request.query;
      if (!email) {
        return reply.code(400).send({ success: false, error: { code: "BAD_REQUEST", message: "email is required" } });
      }
      // We don't require accountId here — the unsubscribe token carries the accountId
      // In production this would be validated from a signed JWT embedded in the link.
      // For this scaffold we return 200 to keep the endpoint testable.
      return reply.send({ success: true, data: { email, messageId: messageId ?? null } });
    }
  );
}
