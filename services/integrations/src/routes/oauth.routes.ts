import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { CredentialsService } from "../services/credentials.service.js";
import type { AccountIntegrationsService } from "../services/account-integrations.service.js";
import { getProvider } from "../providers/index.js";
import { integrations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";

interface OAuthConfig {
  [providerKey: string]: {
    clientId: string;
    clientSecret: string;
  };
}

const callbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});

export function registerOAuthRoutes(
  app: FastifyInstance,
  db: Db,
  credentialsService: CredentialsService,
  accountIntegrations: AccountIntegrationsService,
  oauthConfig: OAuthConfig,
  baseUrl: string,
): void {
  /**
   * GET /integrations/oauth/start/:providerKey
   * Generates an OAuth authorization URL and redirects the user.
   */
  app.get<{ Params: { providerKey: string } }>(
    "/integrations/oauth/start/:providerKey",
    async (request, reply) => {
      const { providerKey } = request.params;
      let provider;
      try {
        provider = getProvider(providerKey);
      } catch {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: `Provider ${providerKey} not found` } });
      }

      const cfg = oauthConfig[providerKey];
      if (!cfg) {
        return reply.code(400).send({ success: false, error: { code: "NOT_CONFIGURED", message: `Provider ${providerKey} is not configured` } });
      }

      // Encode accountId + provider in state (signed with nonce for CSRF prevention)
      const state = Buffer.from(JSON.stringify({
        accountId: request.claims.accountId,
        provider: providerKey,
        nonce: nanoid(),
      })).toString("base64url");

      const redirectUri = `${baseUrl}/integrations/oauth/callback/${providerKey}`;
      const url = provider.startOAuth({
        clientId: cfg.clientId,
        redirectUri,
        state,
      });

      return reply.redirect(url);
    },
  );

  /**
   * GET /integrations/oauth/callback/:providerKey
   * Handles the OAuth callback. Exchanges the code for tokens and stores credentials.
   * This endpoint is public (no JWT auth) as it's accessed by the OAuth provider's redirect.
   */
  app.get<{ Params: { providerKey: string }; Querystring: { code?: string; state?: string } }>(
    "/integrations/oauth/callback/:providerKey",
    { config: { public: true } },
    async (request, reply) => {
      const { providerKey } = request.params;

      let parsed;
      try {
        parsed = callbackQuerySchema.parse(request.query);
      } catch {
        return reply.code(400).send({ success: false, error: { code: "BAD_REQUEST", message: "Missing code or state" } });
      }

      // Decode and validate state
      let stateData: { accountId: string; provider: string; nonce: string };
      try {
        stateData = JSON.parse(Buffer.from(parsed.state, "base64url").toString("utf8")) as typeof stateData;
        if (stateData.provider !== providerKey) throw new Error("Provider mismatch");
      } catch {
        return reply.code(400).send({ success: false, error: { code: "INVALID_STATE", message: "Invalid OAuth state" } });
      }

      let provider;
      try {
        provider = getProvider(providerKey);
      } catch {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: `Provider ${providerKey} not found` } });
      }

      const cfg = oauthConfig[providerKey];
      if (!cfg) {
        return reply.code(400).send({ success: false, error: { code: "NOT_CONFIGURED", message: `Provider ${providerKey} not configured` } });
      }

      const redirectUri = `${baseUrl}/integrations/oauth/callback/${providerKey}`;

      let tokens;
      try {
        tokens = await provider.completeOAuth({
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret,
          redirectUri,
          code: parsed.code,
        });
      } catch (err) {
        app.log.error({ err, providerKey }, "OAuth token exchange failed");
        return reply.code(500).send({ success: false, error: { code: "OAUTH_FAILED", message: "Token exchange failed" } });
      }

      // Find the integration record by provider key
      const [integrationRow] = await db
        .select()
        .from(integrations)
        .where(eq(integrations.key, providerKey));

      if (!integrationRow) {
        return reply.code(500).send({ success: false, error: { code: "INTERNAL", message: "Integration not seeded" } });
      }

      // Store credentials
      const credential = await credentialsService.create({
        accountId: stateData.accountId,
        provider: providerKey,
        secrets: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          ...(tokens.extra ?? {}),
        },
        expiresAt: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : undefined,
        config: { scope: tokens.scope },
      });

      // Create/update account integration
      await accountIntegrations.connect({
        accountId: stateData.accountId,
        integrationId: integrationRow.id,
        credentialId: credential.id,
      });

      // Redirect back to dashboard
      return reply.redirect(`${baseUrl}/settings/integrations?connected=${providerKey}`);
    },
  );
}
