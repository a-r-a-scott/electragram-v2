import { z } from "zod";

import type { Timestamps } from "./common.js";

// ─── Contact ──────────────────────────────────────────────────────────────────

export const ContactStatusSchema = z.enum([
  "active",
  "unsubscribed",
  "archived",
  "imported",
]);
export type ContactStatus = z.infer<typeof ContactStatusSchema>;

export interface ContactEmailAddress extends Timestamps {
  id: string;
  contactId: string;
  accountId: string;
  email: string;
  kind: string;
  status: string;
  subscribedAt: string | null;
  verifiedAt: string | null;
  unsubscribedAt: string | null;
  description: string | null;
}

export interface ContactPhoneNumber extends Timestamps {
  id: string;
  contactId: string;
  accountId: string;
  phone: string;
  kind: string;
  countryCode: string | null;
  status: string;
  hasSms: boolean;
  hasWhatsapp: boolean;
}

export interface Contact extends Timestamps {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: ContactStatus;
  source: string | null;
  customFields: Record<string, unknown>;
  emailAddresses?: ContactEmailAddress[];
  phoneNumbers?: ContactPhoneNumber[];
}

// ─── Contact List ─────────────────────────────────────────────────────────────

export const ContactListStatusSchema = z.enum(["active", "archived"]);
export type ContactListStatus = z.infer<typeof ContactListStatusSchema>;

export interface ContactList extends Timestamps {
  id: string;
  accountId: string;
  name: string;
  status: ContactListStatus;
  membersCount: number;
  description: string | null;
  source: string | null;
  isProtected: boolean;
}

export interface ContactListMember extends Timestamps {
  id: string;
  contactListId: string;
  contactId: string;
  status: string;
}

// ─── Contact Field ────────────────────────────────────────────────────────────

export const ContactFieldKindSchema = z.enum([
  "text",
  "number",
  "date",
  "boolean",
  "select",
  "multi_select",
]);
export type ContactFieldKind = z.infer<typeof ContactFieldKindSchema>;

export interface ContactField extends Timestamps {
  id: string;
  accountId: string;
  eventId: string | null;
  name: string;
  kind: ContactFieldKind;
  position: number;
  details: Record<string, unknown>;
}

// ─── API Schemas ─────────────────────────────────────────────────────────────

export const CreateContactBodySchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
  source: z.string().optional(),
});
export type CreateContactBody = z.infer<typeof CreateContactBodySchema>;

export const UpdateContactBodySchema = CreateContactBodySchema.partial();
export type UpdateContactBody = z.infer<typeof UpdateContactBodySchema>;

export const CreateContactListBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type CreateContactListBody = z.infer<typeof CreateContactListBodySchema>;

export const ContactSearchQuerySchema = z.object({
  q: z.string().optional(),
  status: ContactStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});
export type ContactSearchQuery = z.infer<typeof ContactSearchQuerySchema>;
