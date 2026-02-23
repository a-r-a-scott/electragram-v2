import { eq, and, ilike, sql, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";

import type {
  Contact,
  ContactEmailAddress,
  ContactPhoneNumber,
  CreateContactBody,
  UpdateContactBody,
  ContactSearchQuery,
  PaginatedResponse,
} from "@electragram/types";

import type { Db } from "../db/client.js";
import {
  contacts,
  contactEmailAddresses,
  contactPhoneNumbers,
} from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError, ConflictError } from "./errors.js";

export class ContactsService {
  constructor(private readonly db: Db) {}

  async listContacts(
    accountId: string,
    query: ContactSearchQuery
  ): Promise<PaginatedResponse<Contact>> {
    const offset = (query.page - 1) * query.perPage;

    const baseConditions = [eq(contacts.accountId, accountId)];

    if (query.status) {
      baseConditions.push(eq(contacts.status, query.status));
    }

    const whereClause = query.q
      ? and(
          ...baseConditions,
          sql`${contacts.searchText} @@ plainto_tsquery('english', ${query.q})`
        )
      : and(...baseConditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(contacts)
        .where(whereClause)
        .orderBy(contacts.createdAt)
        .limit(query.perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: rows.map(mapContact),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async getContact(accountId: string, contactId: string): Promise<Contact> {
    const [row] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId)))
      .limit(1);

    if (!row) throw new NotFoundError("Contact not found");

    const [emailAddresses, phoneNumbers] = await Promise.all([
      this.db
        .select()
        .from(contactEmailAddresses)
        .where(eq(contactEmailAddresses.contactId, contactId)),
      this.db
        .select()
        .from(contactPhoneNumbers)
        .where(eq(contactPhoneNumbers.contactId, contactId)),
    ]);

    return {
      ...mapContact(row),
      emailAddresses: emailAddresses.map(mapEmailAddress),
      phoneNumbers: phoneNumbers.map(mapPhoneNumber),
    };
  }

  async createContact(
    accountId: string,
    body: CreateContactBody
  ): Promise<Contact> {
    const emailHash = body.email ? hashEmail(body.email) : null;

    if (emailHash) {
      const [existing] = await this.db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.accountId, accountId),
            eq(contacts.emailHash, emailHash)
          )
        )
        .limit(1);

      if (existing) {
        throw new ConflictError(
          `A contact with email ${body.email} already exists`
        );
      }
    }

    const contactId = generateId("cnt");
    const searchText = buildSearchText(body.firstName, body.lastName, body.email);

    const [contact] = await this.db
      .insert(contacts)
      .values({
        id: contactId,
        accountId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email ?? null,
        phone: body.phone ?? null,
        whatsapp: body.whatsapp ?? null,
        status: "active",
        source: body.source ?? null,
        customFields: body.customFields ?? {},
        emailHash,
        dupeKey: buildDupeKey(body.firstName, body.lastName, body.email),
        searchText: sql`to_tsvector('english', ${searchText})`,
      })
      .returning();

    if (!contact) throw new Error("Failed to create contact");

    if (body.email) {
      await this.db.insert(contactEmailAddresses).values({
        id: generateId("cea"),
        contactId,
        accountId,
        email: body.email.toLowerCase(),
        kind: "primary",
        status: "active",
      });
    }

    return mapContact(contact);
  }

  async updateContact(
    accountId: string,
    contactId: string,
    body: UpdateContactBody
  ): Promise<Contact> {
    const [existing] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId)))
      .limit(1);

    if (!existing) throw new NotFoundError("Contact not found");

    const updates: Partial<typeof contacts.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.firstName !== undefined) updates.firstName = body.firstName;
    if (body.lastName !== undefined) updates.lastName = body.lastName;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.whatsapp !== undefined) updates.whatsapp = body.whatsapp;
    if (body.customFields !== undefined) updates.customFields = body.customFields;
    if (body.source !== undefined) updates.source = body.source;

    if (body.email !== undefined && body.email !== existing.email) {
      const emailHash = hashEmail(body.email);
      const [dup] = await this.db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.accountId, accountId),
            eq(contacts.emailHash, emailHash),
            sql`${contacts.id} != ${contactId}`
          )
        )
        .limit(1);

      if (dup) throw new ConflictError(`Email ${body.email} is already in use`);

      updates.email = body.email;
      updates.emailHash = emailHash;
    }

    const firstName = body.firstName ?? existing.firstName;
    const lastName = body.lastName ?? existing.lastName;
    const email = body.email ?? existing.email;
    const searchText = buildSearchText(firstName, lastName, email ?? undefined);
    updates.searchText = sql`to_tsvector('english', ${searchText})`;

    const [updated] = await this.db
      .update(contacts)
      .set(updates)
      .where(eq(contacts.id, contactId))
      .returning();

    if (!updated) throw new NotFoundError("Contact not found");
    return mapContact(updated);
  }

  async archiveContact(accountId: string, contactId: string): Promise<void> {
    const result = await this.db
      .update(contacts)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId)));

    if (result.rowCount === 0) throw new NotFoundError("Contact not found");
  }

  async addEmailAddress(
    accountId: string,
    contactId: string,
    email: string
  ): Promise<ContactEmailAddress> {
    await this.requireContact(accountId, contactId);

    const existing = await this.db
      .select({ id: contactEmailAddresses.id })
      .from(contactEmailAddresses)
      .where(
        and(
          eq(contactEmailAddresses.accountId, accountId),
          eq(contactEmailAddresses.email, email.toLowerCase())
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError(`Email ${email} already exists in this account`);
    }

    const [row] = await this.db
      .insert(contactEmailAddresses)
      .values({
        id: generateId("cea"),
        contactId,
        accountId,
        email: email.toLowerCase(),
        kind: "secondary",
        status: "active",
      })
      .returning();

    if (!row) throw new Error("Failed to add email address");
    return mapEmailAddress(row);
  }

  async removeEmailAddress(
    accountId: string,
    contactId: string,
    emailId: string
  ): Promise<void> {
    await this.requireContact(accountId, contactId);

    const result = await this.db
      .delete(contactEmailAddresses)
      .where(
        and(
          eq(contactEmailAddresses.id, emailId),
          eq(contactEmailAddresses.contactId, contactId)
        )
      );

    if (result.rowCount === 0) throw new NotFoundError("Email address not found");
  }

  private async requireContact(
    accountId: string,
    contactId: string
  ): Promise<void> {
    const [row] = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId)))
      .limit(1);

    if (!row) throw new NotFoundError("Contact not found");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

export function buildDupeKey(
  firstName: string,
  lastName: string,
  email?: string
): string {
  const parts = [
    firstName.toLowerCase().trim(),
    lastName.toLowerCase().trim(),
    email?.toLowerCase().trim() ?? "",
  ];
  return parts.join("|");
}

export function buildSearchText(
  firstName: string,
  lastName: string,
  email?: string
): string {
  return [firstName, lastName, email].filter(Boolean).join(" ");
}

function mapContact(row: typeof contacts.$inferSelect): Contact {
  return {
    id: row.id,
    accountId: row.accountId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    status: row.status,
    source: row.source,
    customFields: row.customFields as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEmailAddress(
  row: typeof contactEmailAddresses.$inferSelect
): ContactEmailAddress {
  return {
    id: row.id,
    contactId: row.contactId,
    accountId: row.accountId,
    email: row.email,
    kind: row.kind,
    status: row.status,
    subscribedAt: row.subscribedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    unsubscribedAt: row.unsubscribedAt?.toISOString() ?? null,
    description: row.description ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPhoneNumber(
  row: typeof contactPhoneNumbers.$inferSelect
): ContactPhoneNumber {
  return {
    id: row.id,
    contactId: row.contactId,
    accountId: row.accountId,
    phone: row.phone,
    kind: row.kind,
    countryCode: row.countryCode ?? null,
    status: row.status,
    hasSms: row.hasSms,
    hasWhatsapp: row.hasWhatsapp,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
