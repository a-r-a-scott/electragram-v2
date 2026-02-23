import { describe, it, expect, vi, beforeEach } from "vitest";
import { AccountIntegrationsService } from "../../src/services/account-integrations.service.js";
import { NotFoundError } from "../../src/services/errors.js";
import type { Db } from "../../src/db/client.js";

function makeDb(rows: unknown[] = []) {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
    leftJoin: vi.fn().mockReturnThis(),
  };
  const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(rows) };
  const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(rows) };
  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _chains: { select: selectChain, insert: insertChain, update: updateChain },
  };
}

const FAKE_INTEGRATION: Record<string, unknown> = {
  id: "ai_1", accountId: "acc_1", integrationId: "int_1", credentialId: "cred_1",
  status: "active", lastSyncAt: null, lastSyncError: null, config: null,
  createdAt: new Date(), updatedAt: new Date(),
  integrationName: "HubSpot", integrationKey: "hubspot",
  integrationCategory: "crm", integrationAuthKind: "oauth2",
};

describe("AccountIntegrationsService", () => {
  let db: ReturnType<typeof makeDb>;
  let service: AccountIntegrationsService;

  beforeEach(() => {
    db = makeDb([FAKE_INTEGRATION]);
    service = new AccountIntegrationsService(db as unknown as Db);
  });

  describe("list", () => {
    it("returns account integrations with provider info", async () => {
      const results = await service.list("acc_1");
      expect(results).toHaveLength(1);
      expect(results[0]?.integration.key).toBe("hubspot");
    });
  });

  describe("getById", () => {
    it("returns the integration when found", async () => {
      const result = await service.getById("ai_1", "acc_1");
      expect(result.id).toBe("ai_1");
    });

    it("throws NotFoundError when not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.getById("missing", "acc_1")).rejects.toThrow(NotFoundError);
    });
  });

  describe("connect", () => {
    it("updates existing connection if already connected", async () => {
      // First select finds existing, second does the update
      db._chains.select.where.mockResolvedValueOnce([FAKE_INTEGRATION]);
      db._chains.update.returning.mockResolvedValue([{ ...FAKE_INTEGRATION, credentialId: "cred_new", status: "active" }]);

      const result = await service.connect({ accountId: "acc_1", integrationId: "int_1", credentialId: "cred_new" });
      expect(db.update).toHaveBeenCalledOnce();
      expect(result.status).toBe("active");
    });

    it("inserts new connection when not yet connected", async () => {
      db._chains.select.where.mockResolvedValueOnce([]); // no existing
      db._chains.insert.returning.mockResolvedValue([{ ...FAKE_INTEGRATION, id: "ai_new" }]);

      const result = await service.connect({ accountId: "acc_1", integrationId: "int_2", credentialId: "cred_1" });
      expect(db.insert).toHaveBeenCalledOnce();
      expect(result.id).toBe("ai_new");
    });
  });

  describe("disconnect", () => {
    it("throws NotFoundError if not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.disconnect("missing", "acc_1")).rejects.toThrow(NotFoundError);
    });

    it("sets status to disconnected", async () => {
      await service.disconnect("ai_1", "acc_1");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as { status: string } | undefined;
      expect(setArgs?.status).toBe("disconnected");
    });
  });

  describe("markSyncComplete", () => {
    it("updates lastSyncAt and clears error", async () => {
      await service.markSyncComplete("ai_1");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(setArgs?.["lastSyncAt"]).toBeInstanceOf(Date);
      expect(setArgs?.["lastSyncError"]).toBeNull();
    });
  });

  describe("markSyncError", () => {
    it("sets status to error and stores error message", async () => {
      await service.markSyncError("ai_1", "Connection refused");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(setArgs?.["status"]).toBe("error");
      expect(setArgs?.["lastSyncError"]).toBe("Connection refused");
    });
  });
});
