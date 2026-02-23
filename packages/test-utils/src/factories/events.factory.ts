import { faker } from "@faker-js/faker";

import type { Event, EventGuest } from "@electragram/types";

function nowIso(): string {
  return new Date().toISOString();
}

export function buildEvent(overrides: Partial<Event> = {}): Event {
  const startsAt = faker.date.future();
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
  return {
    id: `evt_${faker.string.nanoid(12)}`,
    accountId: `acc_${faker.string.nanoid(12)}`,
    name: faker.lorem.words(4),
    description: faker.lorem.sentence(),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: "active",
    guestsCount: 0,
    listsCount: 0,
    capacityMax: null,
    capacityCount: 0,
    isOpen: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

export function buildEventGuest(
  overrides: Partial<EventGuest> = {}
): EventGuest {
  return {
    id: `egu_${faker.string.nanoid(12)}`,
    eventId: `evt_${faker.string.nanoid(12)}`,
    accountId: `acc_${faker.string.nanoid(12)}`,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    phone: null,
    status: "pending",
    attendanceStatus: null,
    checkedInAt: null,
    customFields: {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}
