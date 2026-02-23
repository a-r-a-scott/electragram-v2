import { describe, it, expect, beforeEach } from "vitest";
import { WsManager, WS_OPEN } from "../../src/ws/manager.js";
import type { WsSocket } from "../../src/ws/manager.js";

function makeSocket(readyState = WS_OPEN): WsSocket & { sent: string[] } {
  return {
    readyState,
    sent: [],
    send(data: string) { this.sent.push(data); },
  };
}

describe("WsManager", () => {
  let manager: WsManager;

  beforeEach(() => {
    manager = new WsManager();
  });

  it("starts with 0 connections", () => {
    expect(manager.totalConnections()).toBe(0);
  });

  it("tracks subscriptions per account", () => {
    const socket = makeSocket();
    manager.subscribe("acc_1", socket);
    expect(manager.connectionCount("acc_1")).toBe(1);
    expect(manager.totalConnections()).toBe(1);
  });

  it("allows multiple connections per account", () => {
    manager.subscribe("acc_1", makeSocket());
    manager.subscribe("acc_1", makeSocket());
    expect(manager.connectionCount("acc_1")).toBe(2);
  });

  it("tracks connections across multiple accounts", () => {
    manager.subscribe("acc_1", makeSocket());
    manager.subscribe("acc_2", makeSocket());
    expect(manager.totalConnections()).toBe(2);
  });

  it("unsubscribe removes the connection", () => {
    const socket = makeSocket();
    manager.subscribe("acc_1", socket);
    manager.unsubscribe("acc_1", socket);
    expect(manager.connectionCount("acc_1")).toBe(0);
  });

  it("broadcast sends JSON to all open connections for the account", () => {
    const s1 = makeSocket();
    const s2 = makeSocket();
    manager.subscribe("acc_1", s1);
    manager.subscribe("acc_1", s2);

    manager.broadcast("acc_1", { type: "message", conversationId: "conv_1", message: { id: "msg_1", direction: "inbound", status: "delivered", content: "Hi", mediaUrls: [], createdAt: new Date() } });

    expect(s1.sent).toHaveLength(1);
    expect(s2.sent).toHaveLength(1);
    const payload = JSON.parse(s1.sent[0]!) as { type: string };
    expect(payload.type).toBe("message");
  });

  it("broadcast skips closed sockets", () => {
    const open = makeSocket(WS_OPEN);
    const closed = makeSocket(3); // 3 = CLOSED
    manager.subscribe("acc_1", open);
    manager.subscribe("acc_1", closed);

    manager.broadcast("acc_1", { type: "message", conversationId: "conv_1", message: { id: "m", direction: "inbound", status: "delivered", content: null, mediaUrls: [], createdAt: new Date() } });

    expect(open.sent).toHaveLength(1);
    expect(closed.sent).toHaveLength(0);
  });

  it("broadcast to unknown account does nothing", () => {
    expect(() => manager.broadcast("unknown", { type: "ping" })).not.toThrow();
  });

  it("unsubscribe on unknown account does nothing", () => {
    expect(() => manager.unsubscribe("unknown", makeSocket())).not.toThrow();
  });
});
