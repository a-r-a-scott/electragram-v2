import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExportsService } from "../../src/services/exports.service.js";
import { NotFoundError } from "../../src/services/errors.js";
import type { Db } from "../../src/db/client.js";

function makeDb(rows: unknown[] = []) {
  const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(rows) };
  const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(rows) };
  const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _chains: { select: selectChain, insert: insertChain, update: updateChain },
  };
}

const FAKE_EXPORT = {
  id: "exp_1", accountId: "acc_1", userId: "usr_1", status: "pending",
  label: "Contacts Export", exportType: "contacts", recordType: null, recordId: null,
  details: null, exportedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

describe("ExportsService", () => {
  let db: ReturnType<typeof makeDb>;
  let service: ExportsService;

  beforeEach(() => {
    db = makeDb([FAKE_EXPORT]);
    service = new ExportsService(db as unknown as Db);
  });

  describe("create", () => {
    it("inserts and returns an export row", async () => {
      db._chains.insert.returning.mockResolvedValue([FAKE_EXPORT]);
      const result = await service.create({ accountId: "acc_1", userId: "usr_1", exportType: "contacts", label: "My Export" });
      expect(result.exportType).toBe("contacts");
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });

  describe("getById", () => {
    it("returns the export when found", async () => {
      const result = await service.getById("exp_1", "acc_1");
      expect(result.id).toBe("exp_1");
    });

    it("throws NotFoundError when not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.getById("missing", "acc_1")).rejects.toThrow(NotFoundError);
    });
  });

  describe("setProcessing", () => {
    it("sets status to processing", async () => {
      await service.setProcessing("exp_1");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as { status: string } | undefined;
      expect(setArgs?.status).toBe("processing");
    });
  });

  describe("setCompleted", () => {
    it("sets status to completed with exportedAt and details", async () => {
      await service.setCompleted("exp_1", { s3Key: "exports/acc_1/exp_1.csv" });
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(setArgs?.["status"]).toBe("completed");
      expect(setArgs?.["exportedAt"]).toBeInstanceOf(Date);
      expect((setArgs?.["details"] as Record<string, string>)?.["s3Key"]).toBe("exports/acc_1/exp_1.csv");
    });
  });

  describe("setFailed", () => {
    it("sets status to failed with error details", async () => {
      await service.setFailed("exp_1", "Something went wrong");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(setArgs?.["status"]).toBe("failed");
      expect((setArgs?.["details"] as Record<string, string>)?.["error"]).toBe("Something went wrong");
    });
  });
});
