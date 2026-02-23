import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversationsService } from "../../src/services/conversations.service.js";
import { NotFoundError } from "../../src/services/errors.js";
import type { Db } from "../../src/db/client.js";

function makeDb() {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };
  // where also resolves for cases that DON'T use .returning()
  updateChain.where.mockImplementation(() => ({
    ...updateChain,
    then: (resolve: (v: unknown[]) => void) => resolve([]),
  }));
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue([]),
    $dynamic: vi.fn().mockReturnThis(),
  };
  const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) };
  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _chains: { select: selectChain, insert: insertChain, update: updateChain },
  };
}

describe("ConversationsService", () => {
  let db: ReturnType<typeof makeDb>;
  let service: ConversationsService;

  beforeEach(() => {
    db = makeDb();
    service = new ConversationsService(db as unknown as Db);
  });

  describe("getById", () => {
    it("throws NotFoundError when no row is found", async () => {
      db._chains.select.offset.mockResolvedValue([]);
      // Use where to return [] for getById
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.getById("conv_1", "acc_1")).rejects.toThrow(NotFoundError);
    });

    it("returns the conversation when found", async () => {
      const fakeRow = { id: "conv_1", accountId: "acc_1", status: "open" };
      db._chains.select.where.mockResolvedValue([fakeRow]);
      const result = await service.getById("conv_1", "acc_1");
      expect(result.id).toBe("conv_1");
    });
  });

  describe("findOrCreate", () => {
    it("returns existing open conversation if found", async () => {
      const fakeRow = { id: "conv_1", sourceId: "src_1", handle: "+447700900123", status: "open" };
      db._chains.select.where.mockResolvedValue([fakeRow]);
      const result = await service.findOrCreate({
        accountId: "acc_1", sourceId: "src_1", channel: "sms", provider: "twilio", handle: "+447700900123",
      });
      expect(result.id).toBe("conv_1");
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("creates a new conversation when none exists", async () => {
      db._chains.select.where.mockResolvedValue([]);
      const fakeCreated = { id: "conv_new", status: "open" };
      db._chains.insert.returning.mockResolvedValue([fakeCreated]);

      const result = await service.findOrCreate({
        accountId: "acc_1", sourceId: "src_1", channel: "sms", provider: "twilio", handle: "+447700900123",
      });
      expect(result.id).toBe("conv_new");
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });

  describe("updateStatus", () => {
    it("throws NotFoundError if conversation not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.updateStatus("conv_x", "acc_1", "resolved")).rejects.toThrow(NotFoundError);
    });

    it("updates status and returns updated row", async () => {
      const fakeRow = { id: "conv_1", accountId: "acc_1", status: "open" };
      const updatedRow = { ...fakeRow, status: "resolved" };
      db._chains.select.where.mockResolvedValue([fakeRow]);
      db._chains.update.returning.mockResolvedValue([updatedRow]);

      const result = await service.updateStatus("conv_1", "acc_1", "resolved");
      expect(result.status).toBe("resolved");
    });
  });

  describe("markUnread", () => {
    it("calls update with unreadAt", async () => {
      const now = new Date();
      db._chains.update.where.mockResolvedValue([]);
      await service.markUnread("conv_1", now);
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe("markRead", () => {
    it("throws NotFoundError if conversation not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.markRead("conv_x", "acc_1")).rejects.toThrow(NotFoundError);
    });

    it("clears unreadAt on successful read", async () => {
      db._chains.select.where.mockResolvedValue([{ id: "conv_1", accountId: "acc_1" }]);
      db._chains.update.where.mockResolvedValue([]);
      await service.markRead("conv_1", "acc_1");
      expect(db.update).toHaveBeenCalledOnce();
    });
  });
});
