import { describe, it, expect, vi, beforeEach } from "vitest";
import { UploadsService } from "../../src/services/uploads.service.js";
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

const FAKE_UPLOAD = {
  id: "upl_1", accountId: "acc_1", userId: "usr_1", status: "pending",
  purpose: "contacts", relateableId: null, relateableType: null,
  mapping: { email: "Email" }, details: { s3Key: "uploads/acc_1/upl_1/file.csv" },
  analyzedAt: null, processedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

describe("UploadsService", () => {
  let db: ReturnType<typeof makeDb>;
  let service: UploadsService;

  beforeEach(() => {
    db = makeDb([FAKE_UPLOAD]);
    service = new UploadsService(db as unknown as Db);
  });

  describe("create", () => {
    it("inserts and returns the upload row", async () => {
      db._chains.insert.returning.mockResolvedValue([FAKE_UPLOAD]);
      const result = await service.create({
        accountId: "acc_1", userId: "usr_1", purpose: "contacts",
        mapping: { email: "Email" }, details: { s3Key: "key" },
      });
      expect(db.insert).toHaveBeenCalledOnce();
      expect(result.accountId).toBe("acc_1");
    });
  });

  describe("getById", () => {
    it("returns the upload when found", async () => {
      const result = await service.getById("upl_1", "acc_1");
      expect(result.id).toBe("upl_1");
    });

    it("throws NotFoundError when not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.getById("missing", "acc_1")).rejects.toThrow(NotFoundError);
    });
  });

  describe("setStatus", () => {
    it("sets status to processing", async () => {
      await service.setStatus("upl_1", "processing");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as { status: string } | undefined;
      expect(setArgs?.status).toBe("processing");
    });

    it("sets processedAt when status is processed", async () => {
      await service.setStatus("upl_1", "processed");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(setArgs?.["processedAt"]).toBeInstanceOf(Date);
    });

    it("sets analyzedAt when status is analyzed", async () => {
      await service.setStatus("upl_1", "analyzed");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(setArgs?.["analyzedAt"]).toBeInstanceOf(Date);
    });
  });

  describe("recordError", () => {
    it("inserts an upload error row", async () => {
      db._chains.insert.returning.mockResolvedValue([{ id: "err_1" }]);
      await service.recordError({ uploadId: "upl_1", rowIndex: 5, rowData: { email: "bad" }, messages: ["Invalid email"] });
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });

  describe("recordRef", () => {
    it("inserts an upload ref row", async () => {
      db._chains.insert.returning.mockResolvedValue([{ id: "ref_1" }]);
      await service.recordRef({ uploadId: "upl_1", recordType: "Contact", recordId: "con_1", created: true });
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });
});
