import { faker } from "@faker-js/faker";

import type { Contact, ContactList } from "@electragram/types";

function nowIso(): string {
  return new Date().toISOString();
}

export function buildContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: `cnt_${faker.string.nanoid(12)}`,
    accountId: `acc_${faker.string.nanoid(12)}`,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    whatsapp: null,
    status: "active",
    source: null,
    customFields: {},
    emailAddresses: [],
    phoneNumbers: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

export function buildContactList(
  overrides: Partial<ContactList> = {}
): ContactList {
  return {
    id: `clt_${faker.string.nanoid(12)}`,
    accountId: `acc_${faker.string.nanoid(12)}`,
    name: faker.lorem.words(3),
    status: "active",
    membersCount: 0,
    description: null,
    source: null,
    isProtected: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}
