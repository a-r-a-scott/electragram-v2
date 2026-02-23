import type { Logger } from "pino";
import type { CredentialsService } from "./credentials.service.js";
import type { AccountIntegrationsService } from "./account-integrations.service.js";
import type { ProviderRefsService } from "./provider-refs.service.js";
import type { ProviderKit, ProviderContact } from "../providers/provider-kit.js";

export interface SyncResult {
  imported: number;
  skipped: number;
  errors: number;
}

/**
 * Minimal interface for calling the Contacts service to create/update contacts.
 * Injectable for testing without a real HTTP call.
 */
export interface ContactsImporter {
  upsert(params: {
    accountId: string;
    email: string;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
  }): Promise<{ id: string }>;
}

export class SyncService {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly accountIntegrations: AccountIntegrationsService,
    private readonly providerRefs: ProviderRefsService,
    private readonly contactsImporter: ContactsImporter,
    private readonly log: Logger,
  ) {}

  /**
   * Run a full contact sync for an account integration.
   * Pulls all contacts from the provider and upserts them into the Contacts service.
   * Updates provider_refs for deduplication on future syncs.
   */
  async syncContacts(
    accountIntegrationId: string,
    accountId: string,
    provider: ProviderKit,
  ): Promise<SyncResult> {
    const accountIntegration = await this.accountIntegrations.getById(accountIntegrationId, accountId);
    if (!accountIntegration.credentialId) {
      throw new Error("Account integration has no credential attached");
    }

    const credentialWithSecrets = await this.credentials.getWithSecrets(
      accountIntegration.credentialId,
      accountId,
    );

    const secrets = {
      accessToken: credentialWithSecrets.secrets["accessToken"] as string,
      refreshToken: credentialWithSecrets.secrets["refreshToken"] as string | undefined,
    };

    let cursor: string | undefined;
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    this.log.info({ accountIntegrationId, provider: provider.key }, "Starting contact sync");

    do {
      let page;
      try {
        page = await provider.fetchContacts(secrets, cursor);
      } catch (err) {
        this.log.error({ err, accountIntegrationId }, "Failed to fetch contacts page");
        await this.accountIntegrations.markSyncError(accountIntegrationId, String(err));
        throw err;
      }

      for (const contact of page.contacts) {
        const result = await this.processContact(
          contact,
          accountId,
          accountIntegration.credentialId,
          provider.key,
        );
        if (result === "imported") imported++;
        else if (result === "skipped") skipped++;
        else errors++;
      }

      cursor = page.nextCursor;
    } while (cursor);

    await this.accountIntegrations.markSyncComplete(accountIntegrationId);
    this.log.info({ accountIntegrationId, imported, skipped, errors }, "Contact sync complete");

    return { imported, skipped, errors };
  }

  private async processContact(
    contact: ProviderContact,
    accountId: string,
    credentialId: string,
    providerKey: string,
  ): Promise<"imported" | "skipped" | "error"> {
    if (!contact.email) return "skipped";

    try {
      const { id: recordId } = await this.contactsImporter.upsert({
        accountId,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
      });

      await this.providerRefs.upsert({
        credentialId,
        provider: providerKey,
        externalKey: contact.externalKey,
        recordId,
        recordType: "Contact",
        kind: "contact",
        details: contact.extra,
      });

      return "imported";
    } catch (err) {
      this.log.warn({ err, externalKey: contact.externalKey }, "Failed to import contact");
      return "error";
    }
  }
}
