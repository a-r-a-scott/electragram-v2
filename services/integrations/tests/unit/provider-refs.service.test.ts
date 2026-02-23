import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderRefsService } from "../../src/services/provider-refs.service.js";
import type { Db } from "../../src/db/client.js";

function makeDb(rows: unknown[] = []) {
  const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(rows) };
  const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(rows) };
  const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(rows) };
  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _chains: { select: selectChain, insert: insertChain, update: updateChain },
  };
}

const FAKE_REF = {
  id: "ref_1", credentialId: "cred_1", provider: "hubspot",
  externalKey: "hs_123", recordId: "contact_1", recordType: "Contact",
  status: "active", kind: "contact", syncedAt: new Date(), details: null,
  createdAt: new Date(), updatedAt: new Date(),
};

describe("ProviderRefsService", () => {
  let db: ReturnType<typeof makeDb>;
  let service: ProviderRefsService;

  beforeEach(() => {
    db = makeDb([FAKE_REF]);
    service = new ProviderRefsService(db as unknown as Db);
  });

  describe("findByExternalKey", () => {
    it("returns the ref when found", async () => {
      const result = await service.findByExternalKey("hubspot", "hs_123", "cred_1");
      expect(result?.externalKey).toBe("hs_123");
    });

    it("returns null when not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      const result = await service.findByExternalKey("hubspot", "unknown", "cred_1");
      expect(result).toBeNull();
    });
  });

  describe("upsert", () => {
    it("inserts new ref when not found", async () => {
      db._chains.select.where.mockResolvedValue([]); // findByExternalKey returns nothing
      db._chains.insert.returning.mockResolvedValue([{ ...FAKE_REF, id: "ref_new" }]);

      const result = await service.upsert({
        credentialId: "cred_1",
        provider: "hubspot",
        externalKey: "hs_999",
        recordId: "contact_new",
        recordType: "Contact",
      });

      expect(db.insert).toHaveBeenCalledOnce();
      expect(result.id).toBe("ref_new");
    });

    it("updates existing ref when found", async () => {
      // findByExternalKey finds FAKE_REF
      const updatedRef = { ...FAKE_REF, recordId: "contact_updated", syncedAt: new Date() };
      db._chains.update.returning.mockResolvedValue([updatedRef]);

      const result = await service.upsert({
        credentialId: "cred_1",
        provider: "hubspot",
        externalKey: "hs_123",
        recordId: "contact_updated",
        recordType: "Contact",
      });

      expect(db.update).toHaveBeenCalledOnce();
      expect(result.recordId).toBe("contact_updated");
    });
  });

  describe("markDeleted", () => {
    it("sets status to deleted", async () => {
      await service.markDeleted("ref_1");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as { status: string } | undefined;
      expect(setArgs?.status).toBe("deleted");
    });
  });
});
