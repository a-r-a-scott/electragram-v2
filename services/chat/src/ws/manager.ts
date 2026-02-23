/**
 * WebSocket connection manager.
 *
 * Tracks open connections keyed by accountId.
 * Uses a minimal interface instead of the concrete `ws.WebSocket` type
 * so the manager is fully unit-testable without a real WebSocket server.
 */

export const WS_OPEN = 1;

export interface WsSocket {
  readyState: number;
  send(data: string): void;
}

export interface NewMessagePayload {
  type: "message";
  conversationId: string;
  message: {
    id: string;
    direction: string;
    status: string;
    content: string | null;
    mediaUrls: string[];
    createdAt: Date;
  };
}

export type WsPayload = NewMessagePayload | { type: string; [key: string]: unknown };

export class WsManager {
  private readonly connections = new Map<string, Set<WsSocket>>();

  subscribe(accountId: string, socket: WsSocket): void {
    let sockets = this.connections.get(accountId);
    if (!sockets) {
      sockets = new Set();
      this.connections.set(accountId, sockets);
    }
    sockets.add(socket);
  }

  unsubscribe(accountId: string, socket: WsSocket): void {
    this.connections.get(accountId)?.delete(socket);
  }

  broadcast(accountId: string, payload: WsPayload): void {
    const sockets = this.connections.get(accountId);
    if (!sockets || sockets.size === 0) return;

    const data = JSON.stringify(payload);
    for (const socket of sockets) {
      if (socket.readyState === WS_OPEN) {
        socket.send(data);
      }
    }
  }

  connectionCount(accountId: string): number {
    return this.connections.get(accountId)?.size ?? 0;
  }

  totalConnections(): number {
    let total = 0;
    for (const sockets of this.connections.values()) {
      total += sockets.size;
    }
    return total;
  }
}
