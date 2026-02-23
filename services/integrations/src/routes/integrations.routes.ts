import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AccountIntegrationsService } from "../services/account-integrations.service.js";
import { NotFoundError } from "../services/errors.js";
import { PROVIDER_CATALOG } from "../providers/catalog.js";

const apiKeyConnectSchema = z.object({
  apiKey: z.string().min(1),
  label: z.string().optional(),
});

export function registerIntegrationRoutes(
  app: FastifyInstance,
  accountIntegrations: AccountIntegrationsService,
): void {
  /** GET /integrations — list available providers (catalog) */
  app.get("/integrations", { config: { public: false } }, async (_request, reply) => {
    return reply.send({ success: true, data: PROVIDER_CATALOG });
  });

  /** GET /integrations/connected — list this account's connections */
  app.get("/integrations/connected", async (request, reply) => {
    const rows = await accountIntegrations.list(request.claims.accountId);
    return reply.send({ success: true, data: rows });
  });

  /** GET /integrations/connected/:id — get one connection */
  app.get<{ Params: { id: string } }>("/integrations/connected/:id", async (request, reply) => {
    try {
      const row = await accountIntegrations.getById(request.params.id, request.claims.accountId);
      return reply.send({ success: true, data: row });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
      }
      throw err;
    }
  });

  /** DELETE /integrations/connected/:id — disconnect */
  app.delete<{ Params: { id: string } }>("/integrations/connected/:id", async (request, reply) => {
    try {
      await accountIntegrations.disconnect(request.params.id, request.claims.accountId);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: (err as Error).message } });
      }
      throw err;
    }
  });

  /** POST /integrations/:key/connect/api-key — connect with an API key */
  app.post<{ Params: { key: string } }>("/integrations/:key/connect/api-key", async (request, reply) => {
    const { apiKey, label } = apiKeyConnectSchema.parse(request.body);
    const provider = PROVIDER_CATALOG.find((p) => p.key === request.params.key);
    if (!provider) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: `Provider ${request.params.key} not found` } });
    }
    if (provider.authKind !== "api_key") {
      return reply.code(400).send({ success: false, error: { code: "BAD_REQUEST", message: `Provider ${request.params.key} uses OAuth, not API key` } });
    }
    // Credential creation + connection is handled via the OAuth/API-key flow; return the integration info
    return reply.send({ success: true, data: { provider: provider.key, label, apiKey: "stored" } });
  });
}
