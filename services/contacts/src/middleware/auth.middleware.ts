import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { jwtVerify, importSPKI } from "jose";

export function createAuthMiddleware(jwtPublicKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const routeConfig = request.routeOptions.config as Record<string, unknown>;
    if (routeConfig["public"] === true) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Missing authorization header" } });
    }

    try {
      const token = authHeader.slice(7);
      const publicKey = await importSPKI(jwtPublicKey.replace(/\\n/g, "\n"), "RS256");
      const { payload } = await jwtVerify(token, publicKey);
      (request as FastifyRequest & { jwtClaims: unknown }).jwtClaims = payload;
    } catch {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } });
    }
  };
}

export function registerAuthMiddleware(app: FastifyInstance, jwtPublicKey: string): void {
  app.addHook("preHandler", createAuthMiddleware(jwtPublicKey));
}
