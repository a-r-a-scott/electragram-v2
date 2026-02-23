import type { ProviderKit, OAuthStartOptions, OAuthCompleteOptions, OAuthTokens, ContactPage, ProviderList, CredentialSecrets } from "./provider-kit.js";

const OAUTH_BASE = "https://login.mailchimp.com/oauth2/authorize";
const TOKEN_URL = "https://login.mailchimp.com/oauth2/token";
const METADATA_URL = "https://login.mailchimp.com/oauth2/metadata";

export class MailchimpProvider implements ProviderKit {
  readonly key = "mailchimp";
  readonly name = "Mailchimp";

  startOAuth(opts: OAuthStartOptions): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: opts.clientId,
      redirect_uri: opts.redirectUri,
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
    if (!res.ok) throw new Error(`Mailchimp token exchange failed: ${res.status}`);
    const data = await res.json() as { access_token: string };

    // Mailchimp access tokens don't expire; fetch DC for API URL
    const meta = await this.fetchMetadata(data.access_token);
    return {
      accessToken: data.access_token,
      extra: { dc: meta.dc, apiEndpoint: meta.api_endpoint },
    };
  }

  async refreshToken(_secrets: CredentialSecrets, _clientId: string, _clientSecret: string): Promise<OAuthTokens> {
    // Mailchimp tokens don't expire — no refresh needed
    throw new Error("Mailchimp does not support token refresh");
  }

  async fetchContacts(secrets: CredentialSecrets, cursor?: string): Promise<ContactPage> {
    const dc = (secrets as unknown as Record<string, unknown>)["dc"] as string | undefined ?? "us1";
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const limit = 100;

    const res = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/search-members?query=&count=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${secrets.accessToken}` } },
    );
    if (!res.ok) throw new Error(`Mailchimp fetchContacts failed: ${res.status}`);

    const data = await res.json() as {
      exact_matches: { members: Array<{ id: string; email_address: string; merge_fields?: { FNAME?: string; LNAME?: string; PHONE?: string } }> };
      total_items: number;
    };

    const contacts = data.exact_matches.members.map((m) => ({
      externalKey: m.id,
      email: m.email_address,
      firstName: m.merge_fields?.FNAME,
      lastName: m.merge_fields?.LNAME,
      phone: m.merge_fields?.PHONE,
    }));

    const nextOffset = offset + contacts.length;
    return {
      contacts,
      nextCursor: nextOffset < data.total_items ? String(nextOffset) : undefined,
    };
  }

  async fetchLists(secrets: CredentialSecrets): Promise<ProviderList[]> {
    const dc = (secrets as unknown as Record<string, unknown>)["dc"] as string | undefined ?? "us1";
    const res = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists?count=100`,
      { headers: { Authorization: `Bearer ${secrets.accessToken}` } },
    );
    if (!res.ok) throw new Error(`Mailchimp fetchLists failed: ${res.status}`);

    const data = await res.json() as { lists: Array<{ id: string; name: string; stats?: { member_count?: number } }> };
    return data.lists.map((l) => ({
      externalKey: l.id,
      name: l.name,
      memberCount: l.stats?.member_count,
    }));
  }

  private async fetchMetadata(accessToken: string): Promise<{ dc: string; api_endpoint: string }> {
    const res = await fetch(METADATA_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Mailchimp metadata fetch failed: ${res.status}`);
    return res.json() as Promise<{ dc: string; api_endpoint: string }>;
  }
}
