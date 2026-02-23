import type { FastifyRequest, FastifyReply } from "fastify";
import { importSPKI, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

export interface JwtClaims extends JWTPayload {
  sub: string;
  accountId: string;
  email: string;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    claims: JwtClaims;
  }
}

export function createAuthMiddleware(jwtPublicKey: string) {
  let publicKey: Awaited<ReturnType<typeof importSPKI>>;

  return async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    if ((request.routeOptions?.config as unknown as Record<string, unknown>)?.public) return;

    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply
        .code(401)
        .send({ success: false, error: { code: "UNAUTHORIZED", message: "Missing token" } });
    }

    const token = auth.slice(7);
    try {
      if (!publicKey) {
        publicKey = await importSPKI(jwtPublicKey, "RS256");
      }
      const { payload } = await jwtVerify(token, publicKey);
      request.claims = payload as JwtClaims;
    } catch {
      return reply
        .code(401)
        .send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid token" } });
    }
  };
}
