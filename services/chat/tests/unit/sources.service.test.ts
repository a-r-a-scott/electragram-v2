import { describe, it, expect, vi, beforeEach } from "vitest";
import { SourcesService } from "../../src/services/sources.service.js";
import { NotFoundError, ConflictError } from "../../src/services/errors.js";
import type { Db } from "../../src/db/client.js";

function makeDb() {
  const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
  const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) };
  const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _chains: { select: selectChain, insert: insertChain, update: updateChain },
  };
}

describe("SourcesService", () => {
  let db: ReturnType<typeof makeDb>;
  let service: SourcesService;

  beforeEach(() => {
    db = makeDb();
    service = new SourcesService(db as unknown as Db);
  });

  describe("getById", () => {
    it("throws NotFoundError when not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.getById("src_x", "acc_1")).rejects.toThrow(NotFoundError);
    });

    it("returns source when found", async () => {
      const fakeRow = { id: "src_1", accountId: "acc_1" };
      db._chains.select.where.mockResolvedValue([fakeRow]);
      const result = await service.getById("src_1", "acc_1");
      expect(result.id).toBe("src_1");
    });
  });

  describe("create", () => {
    it("throws ConflictError if source handle already exists", async () => {
      db._chains.select.where.mockResolvedValue([{ id: "src_1" }]);
      await expect(
        service.create({ channel: "sms", handle: "+441234567890", accountId: "acc_1" }),
      ).rejects.toThrow(ConflictError);
    });

    it("creates a new source when no conflict", async () => {
      const fakeRow = { id: "src_2", channel: "sms", handle: "+449999999999", accountId: "acc_1" };
      db._chains.select.where.mockResolvedValue([]);
      db._chains.insert.returning.mockResolvedValue([fakeRow]);

      const result = await service.create({ channel: "sms", handle: "+449999999999", accountId: "acc_1" });
      expect(result.handle).toBe("+449999999999");
    });
  });

  describe("findByHandle", () => {
    it("returns null when not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      const result = await service.findByHandle("sms", "+999");
      expect(result).toBeNull();
    });

    it("returns source when found", async () => {
      const fakeRow = { id: "src_1", channel: "sms", handle: "+441234567890" };
      db._chains.select.where.mockResolvedValue([fakeRow]);
      const result = await service.findByHandle("sms", "+441234567890");
      expect(result?.id).toBe("src_1");
    });
  });
});
