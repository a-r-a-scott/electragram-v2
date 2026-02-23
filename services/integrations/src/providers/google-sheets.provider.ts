import type { ProviderKit, OAuthStartOptions, OAuthCompleteOptions, OAuthTokens, ContactPage, ProviderList, CredentialSecrets } from "./provider-kit.js";

const OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

export class GoogleSheetsProvider implements ProviderKit {
  readonly key = "google_sheets";
  readonly name = "Google Sheets";

  startOAuth(opts: OAuthStartOptions): string {
    const params = new URLSearchParams({
      client_id: opts.clientId,
      redirect_uri: opts.redirectUri,
      response_type: "code",
      scope: (opts.scopes ?? DEFAULT_SCOPES).join(" "),
      state: opts.state,
      access_type: "offline",
      prompt: "consent",
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
    if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
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
    if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
    const data = await res.json() as { access_token: string; expires_in: number };
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  /**
   * Fetch rows from a Google Sheet as contacts.
   * The spreadsheetId must be in secrets.extra.spreadsheetId.
   * Row 1 is treated as a header row.
   */
  async fetchContacts(secrets: CredentialSecrets, _cursor?: string): Promise<ContactPage> {
    const extra = (secrets as unknown as Record<string, unknown>)["extra"] as Record<string, unknown> | undefined;
    const spreadsheetId = extra?.["spreadsheetId"] as string | undefined;
    if (!spreadsheetId) throw new Error("Missing spreadsheetId in credential secrets");

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secrets.accessToken}` },
    });
    if (!res.ok) throw new Error(`Google Sheets fetchContacts failed: ${res.status}`);

    const data = await res.json() as { values?: string[][] };
    const rows = data.values ?? [];
    if (rows.length < 2) return { contacts: [] };

    const headers = (rows[0] ?? []).map((h) => h.toLowerCase());
    const emailIdx = headers.indexOf("email");
    if (emailIdx === -1) throw new Error("Sheet must have an 'email' column");

    const contacts = rows.slice(1).map((row, i) => ({
      externalKey: String(i + 2), // row number as external key
      email: row[emailIdx] ?? "",
      firstName: row[headers.indexOf("first_name")] ?? row[headers.indexOf("firstname")],
      lastName: row[headers.indexOf("last_name")] ?? row[headers.indexOf("lastname")],
      phone: row[headers.indexOf("phone")],
    })).filter((c) => c.email);

    return { contacts };
  }

  async fetchLists(_secrets: CredentialSecrets): Promise<ProviderList[]> {
    // Google Sheets doesn't have lists — return empty
    return [];
  }
}
