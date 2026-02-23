import { describe, it, expect, vi, beforeEach } from "vitest";
import { SnapshotsService } from "../../src/services/snapshots.service.js";
import { NotFoundError } from "../../src/services/errors.js";
import type { Db } from "../../src/db/client.js";

function makeDb() {
  return {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    select: vi.fn(),
    insert: vi.fn(),
  };
}

describe("SnapshotsService", () => {
  let db: ReturnType<typeof makeDb>;
  let service: SnapshotsService;

  beforeEach(() => {
    db = makeDb();
    service = new SnapshotsService(db as unknown as Db);
  });

  describe("increment", () => {
    it("calls db.execute for a known event kind", async () => {
      await service.increment({ kind: "delivered", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it("does nothing for an unknown event kind", async () => {
      await service.increment({ kind: "unknown" as never, messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(db.execute).not.toHaveBeenCalled();
    });

    it("uses today's date when day is absent", async () => {
      await service.increment({ kind: "sent", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      const callArg = JSON.stringify(db.execute.mock.calls[0]);
      // Should contain a date string (YYYY-MM-DD format)
      expect(callArg).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("uses the provided day when specified", async () => {
      await service.increment({ kind: "sent", messageId: "msg_1", accountId: "acc_1", channel: "email", day: "2025-03-10" });
      const callArg = JSON.stringify(db.execute.mock.calls[0]);
      expect(callArg).toContain("2025-03-10");
    });

    it("executes a second update for clicked events with url", async () => {
      await service.increment({ kind: "clicked", messageId: "msg_1", accountId: "acc_1", channel: "email", url: "https://example.com" });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it("does NOT execute second update for clicked events without url", async () => {
      await service.increment({ kind: "clicked", messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["sent", 1],
      ["delivered", 1],
      ["bounced", 1],
      ["spam_report", 1],
      ["failed", 1],
      ["cancelled", 1],
      ["opened", 1],
      ["unsubscribed", 1],
    ])("executes for kind '%s'", async (kind, calls) => {
      await service.increment({ kind: kind as never, messageId: "msg_1", accountId: "acc_1", channel: "email" });
      expect(db.execute).toHaveBeenCalledTimes(calls);
    });
  });

  describe("listByMessage", () => {
    it("queries with messageId and accountId", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      db.select.mockReturnValue(mockSelect);

      const result = await service.listByMessage("msg_1", "acc_1");
      expect(result).toEqual([]);
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe("summarise", () => {
    it("throws NotFoundError when no snapshots exist", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      db.select.mockReturnValue(mockSelect);

      await expect(service.summarise("msg_1", "acc_1")).rejects.toThrow(NotFoundError);
    });

    it("calculates rates correctly from snapshots", async () => {
      const fakeRows = [
        { messageId: "msg_1", accountId: "acc_1", channel: "email", sends: 100, deliveries: 90, opens: 40, clicks: 20, bounces: 5, unsubscribes: 2, spamReports: 0, failures: 0, cancels: 0, day: "2025-01-10" },
        { messageId: "msg_1", accountId: "acc_1", channel: "email", sends: 50, deliveries: 48, opens: 10, clicks: 5, bounces: 2, unsubscribes: 1, spamReports: 0, failures: 0, cancels: 0, day: "2025-01-11" },
      ];
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(fakeRows),
      };
      db.select.mockReturnValue(mockSelect);

      const summary = await service.summarise("msg_1", "acc_1");
      expect(summary.sends).toBe(150);
      expect(summary.opens).toBe(50);
      expect(summary.openRate).toBeCloseTo(50 / 150);
      expect(summary.clickRate).toBeCloseTo(25 / 150);
      expect(summary.bounceRate).toBeCloseTo(7 / 150);
    });

    it("returns zero rates when sends is 0", async () => {
      const fakeRows = [
        { messageId: "msg_1", accountId: "acc_1", channel: "email", sends: 0, deliveries: 0, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0, day: "2025-01-10" },
      ];
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(fakeRows),
      };
      db.select.mockReturnValue(mockSelect);

      const summary = await service.summarise("msg_1", "acc_1");
      expect(summary.openRate).toBe(0);
      expect(summary.clickRate).toBe(0);
      expect(summary.bounceRate).toBe(0);
    });
  });
});
