import { faker } from "@faker-js/faker";

import type { Account, AccountUser, User } from "@electragram/types";

function nowIso(): string {
  return new Date().toISOString();
}

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: `usr_${faker.string.nanoid(12)}`,
    email: faker.internet.email(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    phoneNumber: faker.phone.number(),
    timeZone: "UTC",
    status: "active",
    role: "normal",
    avatarUrl: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

export function buildAccount(overrides: Partial<Account> = {}): Account {
  const name = faker.company.name();
  return {
    id: `acc_${faker.string.nanoid(12)}`,
    slug: faker.helpers.slugify(name).toLowerCase(),
    name,
    kind: "organization",
    status: "active",
    timeZone: "UTC",
    apiKey: faker.string.alphanumeric(40),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

export function buildAccountUser(
  overrides: Partial<AccountUser> = {}
): AccountUser {
  return {
    id: `acu_${faker.string.nanoid(12)}`,
    userId: `usr_${faker.string.nanoid(12)}`,
    accountId: `acc_${faker.string.nanoid(12)}`,
    isOwner: false,
    roleId: null,
    timeZone: "UTC",
    details: {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}
