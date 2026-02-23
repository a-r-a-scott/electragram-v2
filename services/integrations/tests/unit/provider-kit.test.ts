import { describe, it, expect } from "vitest";
import { getProvider, listProviders } from "../../src/providers/index.js";
import { HubSpotProvider } from "../../src/providers/hubspot.provider.js";
import { MailchimpProvider } from "../../src/providers/mailchimp.provider.js";
import { GoogleSheetsProvider } from "../../src/providers/google-sheets.provider.js";
import { KlaviyoProvider } from "../../src/providers/klaviyo.provider.js";

describe("Provider registry", () => {
  it("lists all providers", () => {
    const providers = listProviders();
    expect(providers.length).toBeGreaterThanOrEqual(4);
    const keys = providers.map((p) => p.key);
    expect(keys).toContain("hubspot");
    expect(keys).toContain("mailchimp");
    expect(keys).toContain("google_sheets");
    expect(keys).toContain("klaviyo");
  });

  it("getProvider returns the correct provider", () => {
    expect(getProvider("hubspot").key).toBe("hubspot");
    expect(getProvider("mailchimp").key).toBe("mailchimp");
  });

  it("getProvider throws for unknown provider", () => {
    expect(() => getProvider("unknown_crm")).toThrow("Unknown integration provider");
  });
});

describe("HubSpotProvider.startOAuth", () => {
  const provider = new HubSpotProvider();

  it("generates a valid HubSpot OAuth URL", () => {
    const url = provider.startOAuth({
      clientId: "client_123",
      redirectUri: "https://example.com/callback",
      state: "state_abc",
    });
    expect(url).toContain("app.hubspot.com/oauth/authorize");
    expect(url).toContain("client_id=client_123");
    expect(url).toContain("state=state_abc");
    expect(url).toContain("crm.objects.contacts.read");
  });

  it("includes custom scopes when provided", () => {
    const url = provider.startOAuth({
      clientId: "c",
      redirectUri: "https://cb",
      state: "s",
      scopes: ["crm.objects.contacts.read", "crm.lists.read", "crm.objects.companies.read"],
    });
    expect(url).toContain("crm.objects.companies.read");
  });
});

describe("MailchimpProvider.startOAuth", () => {
  const provider = new MailchimpProvider();

  it("generates a valid Mailchimp OAuth URL", () => {
    const url = provider.startOAuth({
      clientId: "mc_client",
      redirectUri: "https://example.com/callback",
      state: "state_mc",
    });
    expect(url).toContain("login.mailchimp.com/oauth2/authorize");
    expect(url).toContain("client_id=mc_client");
    expect(url).toContain("state=state_mc");
  });
});

describe("GoogleSheetsProvider.startOAuth", () => {
  const provider = new GoogleSheetsProvider();

  it("generates a valid Google OAuth URL with offline access", () => {
    const url = provider.startOAuth({
      clientId: "goog_client",
      redirectUri: "https://example.com/callback",
      state: "state_g",
    });
    expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toContain("spreadsheets.readonly");
  });
});

describe("KlaviyoProvider", () => {
  const provider = new KlaviyoProvider();

  it("throws on startOAuth (API key provider)", () => {
    expect(() => provider.startOAuth({ clientId: "k", redirectUri: "u", state: "s" })).toThrow("API key");
  });

  it("throws on completeOAuth (API key provider)", async () => {
    await expect(
      provider.completeOAuth({ clientId: "k", clientSecret: "s", redirectUri: "u", code: "c" }),
    ).rejects.toThrow("API key");
  });

  it("throws on refreshToken (API keys do not expire)", async () => {
    await expect(
      provider.refreshToken({ accessToken: "k" }, "c", "s"),
    ).rejects.toThrow("do not expire");
  });
});
