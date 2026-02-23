/** Static provider catalog — seeded into the DB on startup */
export interface CatalogEntry {
  name: string;
  key: string;
  category: string;
  authKind: string;
  description: string;
}

export const PROVIDER_CATALOG: CatalogEntry[] = [
  {
    name: "HubSpot",
    key: "hubspot",
    category: "crm",
    authKind: "oauth2",
    description: "Sync contacts, companies, and lists from HubSpot CRM",
  },
  {
    name: "Mailchimp",
    key: "mailchimp",
    category: "email",
    authKind: "oauth2",
    description: "Sync contacts and audiences from Mailchimp",
  },
  {
    name: "Klaviyo",
    key: "klaviyo",
    category: "email",
    authKind: "api_key",
    description: "Sync profiles and lists from Klaviyo",
  },
  {
    name: "Customer.io",
    key: "customer_io",
    category: "email",
    authKind: "api_key",
    description: "Sync people and segments from Customer.io",
  },
  {
    name: "Salesforce",
    key: "salesforce",
    category: "crm",
    authKind: "oauth2",
    description: "Sync contacts and leads from Salesforce",
  },
  {
    name: "Google Sheets",
    key: "google_sheets",
    category: "spreadsheet",
    authKind: "oauth2",
    description: "Import and sync contacts from Google Sheets",
  },
  {
    name: "Google Contacts",
    key: "google_oauth",
    category: "contacts",
    authKind: "oauth2",
    description: "Import contacts from Google",
  },
];
