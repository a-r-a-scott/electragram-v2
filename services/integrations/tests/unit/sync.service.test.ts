import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncService } from "../../src/services/sync.service.js";
import type { CredentialsService } from "../../src/services/credentials.service.js";
import type { AccountIntegrationsService } from "../../src/services/account-integrations.service.js";
import type { ProviderRefsService } from "../../src/services/provider-refs.service.js";
import type { ContactsImporter } from "../../src/services/sync.service.js";
import type { ProviderKit } from "../../src/providers/provider-kit.js";

const fakeLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as import("pino").Logger;

function makeServices() {
  const credentialsService = {
    getWithSecrets: vi.fn().mockResolvedValue({
      id: "cred_1", accountId: "acc_1", provider: "hubspot", status: "active",
      secrets: { accessToken: "tok_abc", refreshToken: "ref_xyz" },
      label: null, externalKey: null, expiresAt: null, config: null,
      createdAt: new Date(), updatedAt: new Date(),
    }),
  } as unknown as CredentialsService;

  const accountIntegrations = {
    getById: vi.fn().mockResolvedValue({
      id: "ai_1", accountId: "acc_1", integrationId: "int_1", credentialId: "cred_1",
      status: "active", lastSyncAt: null, lastSyncError: null,
    }),
    markSyncComplete: vi.fn().mockResolvedValue(undefined),
    markSyncError: vi.fn().mockResolvedValue(undefined),
  } as unknown as AccountIntegrationsService;

  const providerRefs = {
    upsert: vi.fn().mockResolvedValue({ id: "ref_1" }),
  } as unknown as ProviderRefsService;

  const contactsImporter = {
    upsert: vi.fn().mockResolvedValue({ id: "contact_1" }),
  } as unknown as ContactsImporter;

  return { credentialsService, accountIntegrations, providerRefs, contactsImporter };
}

function makeProvider(pages: Array<{ contacts: Array<{ externalKey: string; email: string; firstName?: string }>; nextCursor?: string }>) {
  let callCount = 0;
  return {
    key: "hubspot",
    name: "HubSpot",
    fetchContacts: vi.fn().mockImplementation(async () => {
      const page = pages[callCount++] ?? { contacts: [] };
      return page;
    }),
    fetchLists: vi.fn().mockResolvedValue([]),
    startOAuth: vi.fn(),
    completeOAuth: vi.fn(),
    refreshToken: vi.fn(),
  } as unknown as ProviderKit;
}

describe("SyncService.syncContacts", () => {
  let syncService: SyncService;
  let services: ReturnType<typeof makeServices>;

  beforeEach(() => {
    services = makeServices();
    syncService = new SyncService(
      services.credentialsService,
      services.accountIntegrations,
      services.providerRefs,
      services.contactsImporter,
      fakeLog,
    );
  });

  it("imports all contacts from a single page", async () => {
    const provider = makeProvider([{
      contacts: [
        { externalKey: "ext_1", email: "alice@example.com", firstName: "Alice" },
        { externalKey: "ext_2", email: "bob@example.com" },
      ],
    }]);

    const result = await syncService.syncContacts("ai_1", "acc_1", provider);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(services.accountIntegrations.markSyncComplete).toHaveBeenCalledWith("ai_1");
  });

  it("handles multiple pages via cursor", async () => {
    const provider = makeProvider([
      { contacts: [{ externalKey: "e1", email: "a@test.com" }], nextCursor: "cursor_2" },
      { contacts: [{ externalKey: "e2", email: "b@test.com" }], nextCursor: "cursor_3" },
      { contacts: [{ externalKey: "e3", email: "c@test.com" }] },
    ]);

    const result = await syncService.syncContacts("ai_1", "acc_1", provider);
    expect(result.imported).toBe(3);
    expect(provider.fetchContacts).toHaveBeenCalledTimes(3);
  });

  it("skips contacts without email", async () => {
    const provider = makeProvider([{
      contacts: [
        { externalKey: "e1", email: "" },
        { externalKey: "e2", email: "valid@test.com" },
      ],
    }]);

    const result = await syncService.syncContacts("ai_1", "acc_1", provider);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("counts errors when contactsImporter fails", async () => {
    services.contactsImporter.upsert = vi.fn().mockRejectedValue(new Error("DB error"));
    const provider = makeProvider([{
      contacts: [{ externalKey: "e1", email: "valid@test.com" }],
    }]);

    const result = await syncService.syncContacts("ai_1", "acc_1", provider);
    expect(result.errors).toBe(1);
    expect(result.imported).toBe(0);
  });

  it("throws and marks error when provider fetch fails", async () => {
    const provider = makeProvider([]);
    (provider.fetchContacts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    await expect(syncService.syncContacts("ai_1", "acc_1", provider)).rejects.toThrow("Network error");
    expect(services.accountIntegrations.markSyncError).toHaveBeenCalledWith("ai_1", expect.stringContaining("Network error"));
  });

  it("throws when credential has no credentialId", async () => {
    (services.accountIntegrations.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ai_1", accountId: "acc_1", credentialId: null,
    });

    const provider = makeProvider([]);
    await expect(syncService.syncContacts("ai_1", "acc_1", provider)).rejects.toThrow("no credential");
  });

  it("creates provider refs for each imported contact", async () => {
    const provider = makeProvider([{
      contacts: [{ externalKey: "hs_123", email: "test@example.com" }],
    }]);

    await syncService.syncContacts("ai_1", "acc_1", provider);

    expect(services.providerRefs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ externalKey: "hs_123", provider: "hubspot", recordType: "Contact" }),
    );
  });
});
