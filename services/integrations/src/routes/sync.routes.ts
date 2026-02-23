import type { FastifyInstance } from "fastify";
import type { SyncService } from "../services/sync.service.js";
import type { AccountIntegrationsService } from "../services/account-integrations.service.js";
import { NotFoundError } from "../services/errors.js";
import { getProvider } from "../providers/index.js";

export function registerSyncRoutes(
  app: FastifyInstance,
  syncService: SyncService,
  accountIntegrations: AccountIntegrationsService,
): void {
  /**
   * POST /integrations/connected/:id/sync
   * Trigger a contact sync for a connected integration.
   * Returns immediately with a job status; actual sync runs inline (for now).
   */
  app.post<{ Params: { id: string } }>(
    "/integrations/connected/:id/sync",
    async (request, reply) => {
      try {
        const integration = await accountIntegrations.getById(
          request.params.id,
          request.claims.accountId,
        );

        // Resolve the provider key (need to join — for now use a simple re-fetch)
        const connected = await accountIntegrations.list(request.claims.accountId);
        const withProvider = connected.find((c) => c.id === integration.id);
        if (!withProvider) {
          return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Integration not found" } });
        }

        let provider;
        try {
          provider = getProvider(withProvider.integration.key);
        } catch {
          return reply.code(400).send({ success: false, error: { code: "PROVIDER_NOT_FOUND", message: `Provider ${withProvider.integration.key} not available` } });
        }

        const result = await syncService.syncContacts(
          integration.id,
          request.claims.accountId,
          provider,
        );

        return reply.send({ success: true, data: result });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
        }
        throw err;
      }
    },
  );
}
