import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { FastifyRequest } from "fastify";
import { importSPKI, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import type { WsManager } from "../ws/manager.js";

interface WsQuery {
  token?: string;
}

interface WsMessage {
  action?: string;
}

export function registerWsRoutes(
  app: FastifyInstance,
  wsManager: WsManager,
  jwtPublicKey: string,
): void {
  let cachedPublicKey: Awaited<ReturnType<typeof importSPKI>> | null = null;

  /**
   * GET /chat/ws?token=<jwt>
   * WebSocket endpoint for real-time message delivery to dashboard agents.
   * Auth: JWT in query string (standard for WebSocket connections).
   */
  app.get<{ Querystring: WsQuery }>(
    "/chat/ws",
    {
      websocket: true,
      config: { public: true }, // Auth handled inline (JWT in query string)
    },
    async (socket: WebSocket, request: FastifyRequest<{ Querystring: WsQuery }>) => {
      const token = request.query.token;
      if (!token) {
        socket.close(4001, "Missing token");
        return;
      }

      let accountId: string;
      try {
        if (!cachedPublicKey) {
          cachedPublicKey = await importSPKI(jwtPublicKey, "RS256");
        }
        const { payload } = await jwtVerify(token, cachedPublicKey);
        const claims = payload as JWTPayload & { accountId?: string };
        if (!claims.accountId) throw new Error("Missing accountId claim");
        accountId = claims.accountId;
      } catch {
        socket.close(4001, "Invalid token");
        return;
      }

      // ws.WebSocket satisfies WsSocket: has readyState + send(data: string)
      wsManager.subscribe(accountId, socket);
      app.log.info({ accountId }, "WebSocket client connected");

      socket.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString()) as WsMessage;
          if (msg.action === "ping") {
            socket.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          // Ignore unparseable control messages
        }
      });

      socket.on("close", () => {
        wsManager.unsubscribe(accountId, socket);
        app.log.info({ accountId }, "WebSocket client disconnected");
      });

      socket.on("error", () => {
        wsManager.unsubscribe(accountId, socket);
      });
    },
  );
}
