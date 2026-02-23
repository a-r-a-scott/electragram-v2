import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SnapshotsService } from "../services/snapshots.service.js";
import { NotFoundError } from "../services/errors.js";

const listQuerySchema = z.object({
  channel: z.string().optional(),
});

export function registerSnapshotRoutes(
  app: FastifyInstance,
  snapshots: SnapshotsService,
): void {
  /** GET /analytics/messages/:messageId/snapshots — daily breakdown */
  app.get<{ Params: { messageId: string }; Querystring: { channel?: string } }>(
    "/analytics/messages/:messageId/snapshots",
    async (request, reply) => {
      const { messageId } = request.params;
      const { channel } = listQuerySchema.parse(request.query);
      const accountId = request.claims.accountId;

      const rows = await snapshots.listByMessage(messageId, accountId, channel);
      return reply.send({ success: true, data: rows });
    },
  );

  /** GET /analytics/messages/:messageId/summary — aggregate totals + rates */
  app.get<{ Params: { messageId: string } }>(
    "/analytics/messages/:messageId/summary",
    async (request, reply) => {
      const { messageId } = request.params;
      const accountId = request.claims.accountId;

      try {
        const summary = await snapshots.summarise(messageId, accountId);
        return reply.send({ success: true, data: summary });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: (err as Error).message },
          });
        }
        throw err;
      }
    },
  );
}
