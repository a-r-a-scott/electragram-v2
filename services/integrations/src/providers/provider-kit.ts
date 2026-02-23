/**
 * ProviderKit — strategy abstraction for all third-party integrations.
 *
 * Every provider implements this interface. The SyncService calls through it
 * without knowing which CRM is on the other side.
 */

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresIn?: number | undefined;
  scope?: string | undefined;
  tokenType?: string | undefined;
  /** Provider-specific extra fields */
  extra?: Record<string, unknown> | undefined;
}

export interface ProviderContact {
  externalKey: string;
  email: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  phone?: string | undefined;
  extra?: Record<string, unknown> | undefined;
}

export interface ProviderList {
  externalKey: string;
  name: string;
  memberCount?: number | undefined;
}

export interface ContactPage {
  contacts: ProviderContact[];
  nextCursor?: string | undefined;
}

export interface OAuthStartOptions {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[] | undefined;
}

export interface OAuthCompleteOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}

export interface CredentialSecrets {
  accessToken: string;
  refreshToken?: string | undefined;
}

export interface ProviderKit {
  readonly key: string;
  readonly name: string;

  /** Build the OAuth authorization URL to redirect the user to */
  startOAuth(opts: OAuthStartOptions): string;

  /** Exchange an authorization code for access + refresh tokens */
  completeOAuth(opts: OAuthCompleteOptions): Promise<OAuthTokens>;

  /** Refresh an expired access token using a refresh token */
  refreshToken(secrets: CredentialSecrets, clientId: string, clientSecret: string): Promise<OAuthTokens>;

  /** Fetch a page of contacts. Pass `cursor` for pagination. */
  fetchContacts(secrets: CredentialSecrets, cursor?: string): Promise<ContactPage>;

  /** Fetch all lists / audiences from the provider */
  fetchLists(secrets: CredentialSecrets): Promise<ProviderList[]>;
}
