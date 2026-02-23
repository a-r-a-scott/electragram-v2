import { faker } from "@faker-js/faker";

import type { Message } from "@electragram/types";

function nowIso(): string {
  return new Date().toISOString();
}

export function buildMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg_${faker.string.nanoid(12)}`,
    accountId: `acc_${faker.string.nanoid(12)}`,
    status: "draft",
    kind: "standard",
    label: faker.lorem.words(3),
    description: null,
    subjectLabel: null,
    recipientLabel: null,
    preheaderLabel: null,
    senderName: null,
    senderEmail: null,
    senderProfileId: null,
    themeId: null,
    templateId: null,
    scheduledAt: null,
    sentAt: null,
    deliveryChannel: "email",
    triggerId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}
