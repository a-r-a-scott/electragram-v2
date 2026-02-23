import type { ProviderKit, OAuthStartOptions, OAuthCompleteOptions, OAuthTokens, ContactPage, ProviderList, CredentialSecrets } from "./provider-kit.js";

/**
 * Klaviyo uses API keys (not OAuth). The `startOAuth` and `completeOAuth`
 * methods are stubs — the account connects by providing an API key directly.
 */
export class KlaviyoProvider implements ProviderKit {
  readonly key = "klaviyo";
  readonly name = "Klaviyo";

  startOAuth(_opts: OAuthStartOptions): string {
    throw new Error("Klaviyo uses API key authentication, not OAuth");
  }

  async completeOAuth(_opts: OAuthCompleteOptions): Promise<OAuthTokens> {
    throw new Error("Klaviyo uses API key authentication, not OAuth");
  }

  async refreshToken(_secrets: CredentialSecrets, _clientId: string, _clientSecret: string): Promise<OAuthTokens> {
    throw new Error("Klaviyo API keys do not expire");
  }

  async fetchContacts(secrets: CredentialSecrets, cursor?: string): Promise<ContactPage> {
    let url = "https://a.klaviyo.com/api/profiles/?fields[profile]=email,first_name,last_name,phone_number&page[size]=100";
    if (cursor) url += `&page[cursor]=${encodeURIComponent(cursor)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Klaviyo-API-Key ${secrets.accessToken}`,
        revision: "2024-07-15",
      },
    });
    if (!res.ok) throw new Error(`Klaviyo fetchContacts failed: ${res.status}`);

    const data = await res.json() as {
      data: Array<{ id: string; attributes: { email: string; first_name?: string; last_name?: string; phone_number?: string } }>;
      links?: { next?: string };
    };

    return {
      contacts: data.data.map((p) => ({
        externalKey: p.id,
        email: p.attributes.email,
        firstName: p.attributes.first_name,
        lastName: p.attributes.last_name,
        phone: p.attributes.phone_number,
      })),
      nextCursor: data.links?.next ? extractCursor(data.links.next) : undefined,
    };
  }

  async fetchLists(secrets: CredentialSecrets): Promise<ProviderList[]> {
    const res = await fetch("https://a.klaviyo.com/api/lists/?page[size]=100", {
      headers: {
        Authorization: `Klaviyo-API-Key ${secrets.accessToken}`,
        revision: "2024-07-15",
      },
    });
    if (!res.ok) throw new Error(`Klaviyo fetchLists failed: ${res.status}`);

    const data = await res.json() as {
      data: Array<{ id: string; attributes: { name: string } }>;
    };

    return data.data.map((l) => ({
      externalKey: l.id,
      name: l.attributes.name,
    }));
  }
}

function extractCursor(url: string): string {
  try {
    return new URL(url).searchParams.get("page[cursor]") ?? url;
  } catch {
    return url;
  }
}
