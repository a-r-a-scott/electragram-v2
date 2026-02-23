import { eq, and, sql, inArray } from "drizzle-orm";

import type {
  ContactList,
  ContactListMember,
  CreateContactListBody,
  PaginatedResponse,
} from "@electragram/types";

import type { Db } from "../db/client.js";
import {
  contactLists,
  contactListMembers,
  contacts,
} from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError, ForbiddenError } from "./errors.js";

export class ListsService {
  constructor(private readonly db: Db) {}

  async listContactLists(
    accountId: string,
    page: number,
    perPage: number
  ): Promise<PaginatedResponse<ContactList>> {
    const offset = (page - 1) * perPage;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(contactLists)
        .where(
          and(
            eq(contactLists.accountId, accountId),
            eq(contactLists.status, "active")
          )
        )
        .orderBy(contactLists.createdAt)
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(contactLists)
        .where(
          and(
            eq(contactLists.accountId, accountId),
            eq(contactLists.status, "active")
          )
        ),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: rows.map(mapList),
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getContactList(accountId: string, listId: string): Promise<ContactList> {
    const [row] = await this.db
      .select()
      .from(contactLists)
      .where(
        and(
          eq(contactLists.id, listId),
          eq(contactLists.accountId, accountId)
        )
      )
      .limit(1);

    if (!row) throw new NotFoundError("Contact list not found");
    return mapList(row);
  }

  async createContactList(
    accountId: string,
    body: CreateContactListBody
  ): Promise<ContactList> {
    const [list] = await this.db
      .insert(contactLists)
      .values({
        id: generateId("clt"),
        accountId,
        name: body.name,
        description: body.description ?? null,
        status: "active",
        membersCount: 0,
        isProtected: false,
      })
      .returning();

    if (!list) throw new Error("Failed to create contact list");
    return mapList(list);
  }

  async updateContactList(
    accountId: string,
    listId: string,
    data: Partial<{ name: string; description: string }>
  ): Promise<ContactList> {
    await this.requireList(accountId, listId);

    const [updated] = await this.db
      .update(contactLists)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contactLists.id, listId))
      .returning();

    if (!updated) throw new NotFoundError("Contact list not found");
    return mapList(updated);
  }

  async archiveContactList(accountId: string, listId: string): Promise<void> {
    const [list] = await this.db
      .select()
      .from(contactLists)
      .where(
        and(
          eq(contactLists.id, listId),
          eq(contactLists.accountId, accountId)
        )
      )
      .limit(1);

    if (!list) throw new NotFoundError("Contact list not found");
    if (list.isProtected) throw new ForbiddenError("Cannot archive a protected list");

    await this.db
      .update(contactLists)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(contactLists.id, listId));
  }

  async listMembers(
    accountId: string,
    listId: string,
    page: number,
    perPage: number
  ): Promise<PaginatedResponse<ContactListMember>> {
    await this.requireList(accountId, listId);
    const offset = (page - 1) * perPage;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(contactListMembers)
        .where(eq(contactListMembers.contactListId, listId))
        .orderBy(contactListMembers.createdAt)
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(contactListMembers)
        .where(eq(contactListMembers.contactListId, listId)),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: rows.map(mapMember),
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async addMembers(
    accountId: string,
    listId: string,
    contactIds: string[]
  ): Promise<{ added: number }> {
    await this.requireList(accountId, listId);

    const validContacts = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.accountId, accountId),
          inArray(contacts.id, contactIds)
        )
      );

    if (validContacts.length === 0) return { added: 0 };

    const existing = await this.db
      .select({ contactId: contactListMembers.contactId })
      .from(contactListMembers)
      .where(
        and(
          eq(contactListMembers.contactListId, listId),
          inArray(
            contactListMembers.contactId,
            validContacts.map((c) => c.id)
          )
        )
      );

    const existingIds = new Set(existing.map((e) => e.contactId));
    const toAdd = validContacts.filter((c) => !existingIds.has(c.id));

    if (toAdd.length === 0) return { added: 0 };

    await this.db.insert(contactListMembers).values(
      toAdd.map((c) => ({
        id: generateId("clm"),
        contactListId: listId,
        contactId: c.id,
        status: "active",
      }))
    );

    await this.db
      .update(contactLists)
      .set({
        membersCount: sql`members_count + ${toAdd.length}`,
        updatedAt: new Date(),
      })
      .where(eq(contactLists.id, listId));

    return { added: toAdd.length };
  }

  async removeMembers(
    accountId: string,
    listId: string,
    contactIds: string[]
  ): Promise<{ removed: number }> {
    await this.requireList(accountId, listId);

    const result = await this.db
      .delete(contactListMembers)
      .where(
        and(
          eq(contactListMembers.contactListId, listId),
          inArray(contactListMembers.contactId, contactIds)
        )
      );

    const removed = result.rowCount ?? 0;
    if (removed > 0) {
      await this.db
        .update(contactLists)
        .set({
          membersCount: sql`GREATEST(0, members_count - ${removed})`,
          updatedAt: new Date(),
        })
        .where(eq(contactLists.id, listId));
    }

    return { removed };
  }

  private async requireList(accountId: string, listId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: contactLists.id })
      .from(contactLists)
      .where(
        and(
          eq(contactLists.id, listId),
          eq(contactLists.accountId, accountId)
        )
      )
      .limit(1);

    if (!row) throw new NotFoundError("Contact list not found");
  }
}

function mapList(row: typeof contactLists.$inferSelect): ContactList {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    status: row.status,
    membersCount: row.membersCount,
    description: row.description ?? null,
    source: row.source ?? null,
    isProtected: row.isProtected,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapMember(
  row: typeof contactListMembers.$inferSelect
): ContactListMember {
  return {
    id: row.id,
    contactListId: row.contactListId,
    contactId: row.contactId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}
