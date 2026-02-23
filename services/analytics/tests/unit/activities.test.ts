import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActivitiesService } from "../../src/services/activities.service.js";
import type { Db } from "../../src/db/client.js";

function makeDb() {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{
      id: 1,
      accountId: "acc_1",
      actorId: "msg_1",
      actorType: "Message",
      action: "message.sent",
      relateableId: null,
      relateableType: null,
      details: null,
      createdAt: new Date(),
    }]),
  };
  return {
    insert: vi.fn().mockReturnValue(insertChain),
    select: vi.fn(),
    _insertChain: insertChain,
  };
}

describe("ActivitiesService", () => {
  let db: ReturnType<typeof makeDb>;
  let service: ActivitiesService;

  beforeEach(() => {
    db = makeDb();
    service = new ActivitiesService(db as unknown as Db);
  });

  describe("record", () => {
    function lastCallValues() {
      const call = db._insertChain.values.mock.calls.at(-1);
      if (!call) throw new Error("insert.values not called");
      return call[0] as Record<string, unknown>;
    }

    it("inserts an activity for 'sent' events", async () => {
      await service.record({ kind: "sent", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(db.insert).toHaveBeenCalledOnce();
      expect(lastCallValues()["action"]).toBe("message.sent");
    });

    it("inserts an activity for 'delivered' events", async () => {
      await service.record({ kind: "delivered", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(lastCallValues()["action"]).toBe("message.delivered");
    });

    it("inserts an activity for 'failed' events", async () => {
      await service.record({ kind: "failed", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(lastCallValues()["action"]).toBe("message.failed");
    });

    it("inserts an activity for 'bounced' events", async () => {
      await service.record({ kind: "bounced", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(lastCallValues()["action"]).toBe("message.bounced");
    });

    it("inserts an activity for 'unsubscribed' events", async () => {
      await service.record({ kind: "unsubscribed", messageId: "msg_1", accountId: "acc_1", channel: "email", recipientId: "rec_1", recipientType: "contact" });
      const vals = lastCallValues();
      expect(vals["action"]).toBe("message.unsubscribed");
      expect(vals["relateableId"]).toBe("rec_1");
      expect(vals["relateableType"]).toBe("Contact");
    });

    it("sets relateableType to 'Guest' for guest recipients", async () => {
      await service.record({ kind: "sent", messageId: "msg_1", accountId: "acc_1", channel: "email", recipientId: "gst_1", recipientType: "guest" });
      expect(lastCallValues()["relateableType"]).toBe("Guest");
    });

    it("does NOT insert for non-recordable kinds ('opened')", async () => {
      await service.record({ kind: "opened", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("does NOT insert for non-recordable kinds ('clicked')", async () => {
      await service.record({ kind: "clicked", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("does NOT insert for non-recordable kinds ('spam_report')", async () => {
      await service.record({ kind: "spam_report", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("includes channel in details", async () => {
      await service.record({ kind: "delivered", messageId: "msg_1", accountId: "acc_1", channel: "sms" });
      const call = db._insertChain.values.mock.calls.at(-1);
      if (!call) throw new Error("insert.values not called");
      const values = call[0] as Record<string, unknown>;
      expect((values["details"] as Record<string, unknown>)["channel"]).toBe("sms");
    });
  });

  describe("create", () => {
    it("creates an activity with all specified fields", async () => {
      const result = await service.create({
        accountId: "acc_1",
        actorId: "msg_1",
        actorType: "Message",
        action: "message.sent",
        details: { foo: "bar" },
      });
      expect(result.action).toBe("message.sent");
    });
  });

  describe("list", () => {
    it("queries activities for the given account", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      db.select.mockReturnValue(mockSelect);

      const result = await service.list({ accountId: "acc_1" });
      expect(result).toEqual([]);
      expect(db.select).toHaveBeenCalled();
    });

    it("caps limit at 200", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      db.select.mockReturnValue(mockSelect);

      await service.list({ accountId: "acc_1", limit: 999 });
      const limitCall = mockSelect.limit.mock.calls.at(0);
      expect(limitCall?.[0] as number).toBe(200);
    });
  });
});
