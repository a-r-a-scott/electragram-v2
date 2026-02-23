import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AccountsService } from "../services/accounts.service.js";
import { NotFoundError, ForbiddenError } from "../services/errors.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

const UpdateAccountBodySchema = z.object({
  name: z.string().min(1).optional(),
  timeZone: z.string().optional(),
});

export function registerAccountRoutes(
  app: FastifyInstance,
  accountsService: AccountsService
): void {
  app.get("/api/accounts", async (request: AuthenticatedRequest, reply) => {
    const userId = request.jwtClaims.sub;
    const accts = await accountsService.listUserAccounts(userId);
    return reply.send({ success: true, data: accts });
  });

  app.get(
    "/api/accounts/:accountId",
    async (request: AuthenticatedRequest, reply) => {
      const { accountId } = request.params as { accountId: string };
      try {
        const account = await accountsService.getAccount(
          accountId,
          request.jwtClaims.sub
        );
        return reply.send({ success: true, data: account });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: err.message } });
        }
        if (err instanceof ForbiddenError) {
          return reply.code(403).send({ success: false, error: { code: "FORBIDDEN", message: err.message } });
        }
        throw err;
      }
    }
  );

  app.patch(
    "/api/accounts/:accountId",
    async (request: AuthenticatedRequest, reply) => {
      const { accountId } = request.params as { accountId: string };
      const body = UpdateAccountBodySchema.parse(request.body);
      try {
        const account = await accountsService.updateAccount(
          accountId,
          request.jwtClaims.sub,
          body
        );
        return reply.send({ success: true, data: account });
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return reply.code(403).send({ success: false, error: { code: "FORBIDDEN", message: err.message } });
        }
        throw err;
      }
    }
  );

  app.get(
    "/api/accounts/:accountId/users",
    async (request: AuthenticatedRequest, reply) => {
      const { accountId } = request.params as { accountId: string };
      try {
        const members = await accountsService.listMembers(
          accountId,
          request.jwtClaims.sub
        );
        return reply.send({ success: true, data: members });
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return reply.code(403).send({ success: false, error: { code: "FORBIDDEN", message: err.message } });
        }
        throw err;
      }
    }
  );

  app.delete(
    "/api/accounts/:accountId/users/:userId",
    async (request: AuthenticatedRequest, reply) => {
      const { accountId, userId } = request.params as {
        accountId: string;
        userId: string;
      };
      try {
        await accountsService.removeMember(
          accountId,
          userId,
          request.jwtClaims.sub
        );
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: err.message } });
        }
        if (err instanceof ForbiddenError) {
          return reply.code(403).send({ success: false, error: { code: "FORBIDDEN", message: err.message } });
        }
        throw err;
      }
    }
  );
}
