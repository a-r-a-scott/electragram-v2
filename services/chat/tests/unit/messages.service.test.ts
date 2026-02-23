import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessagesService } from "../../src/services/messages.service.js";
import { NotFoundError } from "../../src/services/errors.js";
import type { Db } from "../../src/db/client.js";
import type { TwilioSender } from "../../src/services/messages.service.js";

function makeDb() {
  const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) };
  const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) };
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };
  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _chains: { select: selectChain, insert: insertChain, update: updateChain },
  };
}

function makeTwilio(): TwilioSender {
  return { send: vi.fn().mockResolvedValue({ sid: "SM_test_sid" }) };
}

describe("MessagesService", () => {
  let db: ReturnType<typeof makeDb>;
  let twilio: TwilioSender;
  let service: MessagesService;

  beforeEach(() => {
    db = makeDb();
    twilio = makeTwilio();
    service = new MessagesService(db as unknown as Db, twilio);
  });

  describe("getById", () => {
    it("throws NotFoundError when not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.getById("msg_x")).rejects.toThrow(NotFoundError);
    });

    it("returns message when found", async () => {
      const fakeRow = { id: "msg_1", direction: "inbound", status: "delivered" };
      db._chains.select.where.mockResolvedValue([fakeRow]);
      const result = await service.getById("msg_1");
      expect(result.id).toBe("msg_1");
    });
  });

  describe("createInbound", () => {
    it("inserts inbound message and returns it", async () => {
      const fakeRow = { id: "msg_1", direction: "inbound", status: "delivered", content: "Hello", conversationId: "conv_1", mediaUrls: [], externalMessageKey: "SM123" };
      db._chains.insert.returning.mockResolvedValue([fakeRow]);

      const result = await service.createInbound({
        conversationId: "conv_1",
        content: "Hello",
        externalMessageKey: "SM123",
      });
      expect(result.direction).toBe("inbound");
      expect(result.status).toBe("delivered");
    });
  });

  describe("sendOutbound", () => {
    it("creates pending message, calls Twilio, updates to sent", async () => {
      const pendingRow = { id: "msg_2", direction: "outbound", status: "pending", content: "Reply", conversationId: "conv_1", mediaUrls: [], externalMessageKey: null };
      const sentRow = { ...pendingRow, status: "sent", externalMessageKey: "SM_test_sid" };
      db._chains.insert.returning.mockResolvedValue([pendingRow]);
      db._chains.update.returning.mockResolvedValue([sentRow]);

      const result = await service.sendOutbound({
        conversationId: "conv_1",
        fromHandle: "+441234567890",
        toHandle: "+447700900123",
        channel: "sms",
        content: "Reply",
      });

      expect(twilio.send).toHaveBeenCalledWith(expect.objectContaining({ to: "+447700900123", from: "+441234567890" }));
      expect(result.status).toBe("sent");
      expect(result.externalMessageKey).toBe("SM_test_sid");
    });

    it("marks message as failed and throws when Twilio fails", async () => {
      const pendingRow = { id: "msg_3", direction: "outbound", status: "pending", content: "Hey", conversationId: "conv_1", mediaUrls: [] };
      db._chains.insert.returning.mockResolvedValue([pendingRow]);
      vi.mocked(twilio.send).mockRejectedValue(new Error("Twilio down"));

      await expect(
        service.sendOutbound({ conversationId: "conv_1", fromHandle: "+1", toHandle: "+2", channel: "sms", content: "Hey" }),
      ).rejects.toThrow("Failed to send message via Twilio");

      expect(db.update).toHaveBeenCalledTimes(1);
      const setArgs = db._chains.update.set.mock.calls.at(0)?.[0] as { status: string } | undefined;
      expect(setArgs?.status).toBe("failed");
    });
  });

  describe("updateStatus", () => {
    it("calls update with the new status", async () => {
      await service.updateStatus("msg_1", "delivered");
      expect(db.update).toHaveBeenCalledOnce();
    });
  });
});
