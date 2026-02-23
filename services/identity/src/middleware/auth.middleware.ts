import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";

import type { JwtClaims } from "@electragram/types";

import type { JwtService } from "../utils/jwt.js";

export interface AuthenticatedRequest extends FastifyRequest {
  jwtClaims: JwtClaims;
}

export function registerAuthMiddleware(
  app: FastifyInstance,
  jwtService: JwtService
): void {
  app.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const routeConfig = request.routeOptions.config as Record<string, unknown>;
      if (routeConfig["public"] === true) return;

      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.code(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing authorization header" },
        });
      }

      const token = authHeader.slice(7);
      try {
        const claims = await jwtService.verifyAccessToken(token);
        (request as AuthenticatedRequest).jwtClaims = claims;
      } catch {
        return reply.code(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
        });
      }
    }
  );
}
