import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { SignInBodySchema, SignUpBodySchema } from "@electragram/types";

import type { AuthService } from "../services/auth.service.js";
import { UnauthorizedError, ConflictError } from "../services/auth.service.js";

export function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService
): void {
  app.post("/api/auth/signin", async (request, reply) => {
    const body = SignInBodySchema.parse(request.body);
    try {
      const result = await authService.signIn(
        body,
        request.ip
      );
      return reply.code(200).send({ success: true, data: result });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: err.message } });
      }
      throw err;
    }
  });

  app.post("/api/auth/signup", async (request, reply) => {
    const body = SignUpBodySchema.parse(request.body);
    try {
      const result = await authService.signUp(body, request.ip);
      return reply.code(201).send({ success: true, data: result });
    } catch (err) {
      if (err instanceof ConflictError) {
        return reply.code(409).send({ success: false, error: { code: "CONFLICT", message: err.message } });
      }
      throw err;
    }
  });

  const RefreshBodySchema = z.object({ refreshToken: z.string() });

  app.post("/api/auth/refresh", async (request, reply) => {
    const { refreshToken } = RefreshBodySchema.parse(request.body);
    try {
      const result = await authService.refreshTokens(refreshToken);
      return reply.code(200).send({ success: true, data: result });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: err.message } });
      }
      throw err;
    }
  });

  app.delete("/api/auth/signout", async (request, reply) => {
    const { refreshToken } = RefreshBodySchema.parse(request.body);
    await authService.signOut(refreshToken);
    return reply.code(204).send();
  });
}
