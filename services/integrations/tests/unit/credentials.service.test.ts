import { describe, it, expect, vi, beforeEach } from "vitest";
import { CredentialsService } from "../../src/services/credentials.service.js";
import { NotFoundError } from "../../src/services/errors.js";
import type { Db } from "../../src/db/client.js";

const TEST_KEY = "a".repeat(64);

function makeDb() {
  const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), $dynamic: vi.fn().mockReturnThis() };
  const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) };
  const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _chains: { select: selectChain, insert: insertChain, update: updateChain },
  };
}

describe("CredentialsService", () => {
  let db: ReturnType<typeof makeDb>;
  let service: CredentialsService;

  beforeEach(() => {
    db = makeDb();
    service = new CredentialsService(db as unknown as Db, TEST_KEY);
  });

  describe("getById", () => {
    it("throws NotFoundError when not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.getById("cred_x", "acc_1")).rejects.toThrow(NotFoundError);
    });

    it("returns credential without secrets", async () => {
      const fakeRow = { id: "cred_1", accountId: "acc_1", provider: "hubspot", status: "active", secrets: "encrypted" };
      db._chains.select.where.mockResolvedValue([fakeRow]);
      const result = await service.getById("cred_1", "acc_1");
      expect(result.id).toBe("cred_1");
    });
  });

  describe("create", () => {
    it("encrypts secrets before storing", async () => {
      const fakeRow = { id: "cred_2", accountId: "acc_1", provider: "hubspot", status: "active", secrets: "encrypted_value", label: null, externalKey: null, expiresAt: null, config: null, createdAt: new Date(), updatedAt: new Date() };
      db._chains.insert.returning.mockResolvedValue([fakeRow]);

      const result = await service.create({
        accountId: "acc_1",
        provider: "hubspot",
        secrets: { accessToken: "tok_abc", refreshToken: "ref_xyz" },
      });

      expect(db.insert).toHaveBeenCalledOnce();
      const insertValues = db._chains.insert.values.mock.calls[0]?.[0] as Record<string, unknown>;
      // Verify secrets are encrypted (not plaintext)
      expect(insertValues?.["secrets"]).not.toContain("tok_abc");
      expect(insertValues?.["secrets"]).toMatch(/^[0-9a-f]+:/); // IV:TAG:DATA hex format
      // Result should not expose secrets
      expect("secrets" in result).toBe(false);
    });
  });

  describe("getWithSecrets", () => {
    it("decrypts secrets on retrieval", async () => {
      const { encryptSecrets } = await import("../../src/services/crypto.js");
      const originalSecrets = { accessToken: "tok_123", refreshToken: "ref_456" };
      const encrypted = encryptSecrets(originalSecrets, TEST_KEY);

      db._chains.select.where.mockResolvedValue([{
        id: "cred_3", accountId: "acc_1", provider: "mailchimp", status: "active",
        secrets: encrypted, label: null, externalKey: null, expiresAt: null, config: null,
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      const result = await service.getWithSecrets("cred_3", "acc_1");
      expect(result.secrets["accessToken"]).toBe("tok_123");
      expect(result.secrets["refreshToken"]).toBe("ref_456");
    });

    it("returns empty secrets when field is null", async () => {
      db._chains.select.where.mockResolvedValue([{
        id: "cred_4", accountId: "acc_1", provider: "klaviyo", status: "active",
        secrets: null, label: null, externalKey: null, expiresAt: null, config: null,
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      const result = await service.getWithSecrets("cred_4", "acc_1");
      expect(result.secrets).toEqual({});
    });
  });

  describe("revoke", () => {
    it("throws NotFoundError if credential not found", async () => {
      db._chains.select.where.mockResolvedValue([]);
      await expect(service.revoke("cred_x", "acc_1")).rejects.toThrow(NotFoundError);
    });

    it("sets status to revoked", async () => {
      db._chains.select.where.mockResolvedValue([{ id: "cred_5", accountId: "acc_1" }]);
      await service.revoke("cred_5", "acc_1");
      const setArgs = db._chains.update.set.mock.calls[0]?.[0] as { status: string } | undefined;
      expect(setArgs?.status).toBe("revoked");
    });
  });
});
