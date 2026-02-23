import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ActivitiesService } from "../services/activities.service.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.coerce.number().int().optional(),
  actorId: z.string().optional(),
  actorType: z.string().optional(),
});

export function registerActivityRoutes(
  app: FastifyInstance,
  activitiesService: ActivitiesService,
): void {
  /** GET /analytics/activities — paginated activity feed for the account */
  app.get<{
    Querystring: {
      limit?: string;
      before?: string;
      actorId?: string;
      actorType?: string;
    };
  }>(
    "/analytics/activities",
    async (request, reply) => {
      const accountId = request.claims.accountId;
      const { limit, before, actorId, actorType } = listQuerySchema.parse(request.query);

      const rows = await activitiesService.list({
        accountId,
        ...(limit !== undefined && { limit }),
        ...(before !== undefined && { before }),
        ...(actorId !== undefined && { actorId }),
        ...(actorType !== undefined && { actorType }),
      });

      return reply.send({ success: true, data: rows });
    },
  );
}
