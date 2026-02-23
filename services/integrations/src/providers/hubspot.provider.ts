import type { ProviderKit, OAuthStartOptions, OAuthCompleteOptions, OAuthTokens, ContactPage, ProviderList, CredentialSecrets } from "./provider-kit.js";

const OAUTH_BASE = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const CONTACTS_URL = "https://api.hubapi.com/crm/v3/objects/contacts";

export class HubSpotProvider implements ProviderKit {
  readonly key = "hubspot";
  readonly name = "HubSpot";

  startOAuth(opts: OAuthStartOptions): string {
    const params = new URLSearchParams({
      client_id: opts.clientId,
      redirect_uri: opts.redirectUri,
      scope: (opts.scopes ?? ["crm.objects.contacts.read", "crm.lists.read"]).join(" "),
      state: opts.state,
    });
    return `${OAUTH_BASE}?${params.toString()}`;
  }

  async completeOAuth(opts: OAuthCompleteOptions): Promise<OAuthTokens> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        redirect_uri: opts.redirectUri,
        code: opts.code,
      }).toString(),
    });
    if (!res.ok) throw new Error(`HubSpot token exchange failed: ${res.status}`);
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async refreshToken(secrets: CredentialSecrets, clientId: string, clientSecret: string): Promise<OAuthTokens> {
    if (!secrets.refreshToken) throw new Error("No refresh token available");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: secrets.refreshToken,
      }).toString(),
    });
    if (!res.ok) throw new Error(`HubSpot token refresh failed: ${res.status}`);
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  }

  async fetchContacts(secrets: CredentialSecrets, cursor?: string): Promise<ContactPage> {
    const params = new URLSearchParams({ limit: "100", properties: "email,firstname,lastname,phone" });
    if (cursor) params.set("after", cursor);

    const res = await fetch(`${CONTACTS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${secrets.accessToken}` },
    });
    if (!res.ok) throw new Error(`HubSpot fetchContacts failed: ${res.status}`);

    const data = await res.json() as {
      results: Array<{ id: string; properties: { email: string; firstname?: string; lastname?: string; phone?: string } }>;
      paging?: { next?: { after: string } };
    };

    return {
      contacts: data.results.map((r) => ({
        externalKey: r.id,
        email: r.properties.email,
        firstName: r.properties.firstname,
        lastName: r.properties.lastname,
        phone: r.properties.phone,
      })),
      nextCursor: data.paging?.next?.after,
    };
  }

  async fetchLists(secrets: CredentialSecrets): Promise<ProviderList[]> {
    const res = await fetch("https://api.hubapi.com/crm/v3/lists/?limit=100", {
      headers: { Authorization: `Bearer ${secrets.accessToken}` },
    });
    if (!res.ok) throw new Error(`HubSpot fetchLists failed: ${res.status}`);

    const data = await res.json() as {
      lists: Array<{ listId: string; name: string; metadata?: { size?: number } }>;
    };

    return data.lists.map((l) => ({
      externalKey: String(l.listId),
      name: l.name,
      memberCount: l.metadata?.size,
    }));
  }
}
