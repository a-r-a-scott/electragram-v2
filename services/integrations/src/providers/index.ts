import type { ProviderKit } from "./provider-kit.js";
import { HubSpotProvider } from "./hubspot.provider.js";
import { MailchimpProvider } from "./mailchimp.provider.js";
import { GoogleSheetsProvider } from "./google-sheets.provider.js";
import { KlaviyoProvider } from "./klaviyo.provider.js";

export type { ProviderKit } from "./provider-kit.js";
export type { OAuthTokens, ProviderContact, ProviderList, ContactPage, CredentialSecrets, OAuthStartOptions, OAuthCompleteOptions } from "./provider-kit.js";

const PROVIDERS: ProviderKit[] = [
  new HubSpotProvider(),
  new MailchimpProvider(),
  new GoogleSheetsProvider(),
  new KlaviyoProvider(),
];

const REGISTRY = new Map<string, ProviderKit>(PROVIDERS.map((p) => [p.key, p]));

export function getProvider(key: string): ProviderKit {
  const provider = REGISTRY.get(key);
  if (!provider) throw new Error(`Unknown integration provider: ${key}`);
  return provider;
}

export function listProviders(): ProviderKit[] {
  return PROVIDERS;
}
