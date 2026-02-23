import { describe, it, expect, beforeEach } from "vitest";
import { MockSqsDispatcher } from "../../../src/services/sqs.service.js";
import type { DispatchPayload } from "../../../src/services/sqs.service.js";

const makePayload = (overrides: Partial<DispatchPayload> = {}): DispatchPayload => ({
  messageId: "msg_123",
  recipientId: "rcp_456",
  accountId: "acc_789",
  kind: "email",
  to: "alice@example.com",
  subject: "Test Subject",
  body: "Hello Alice",
  bodyHtml: null,
  fromName: "Acme",
  fromEmail: "no-reply@acme.com",
  replyTo: null,
  firstName: "Alice",
  lastName: "Smith",
  ...overrides,
});

describe("MockSqsDispatcher", () => {
  let dispatcher: MockSqsDispatcher;

  beforeEach(() => {
    dispatcher = new MockSqsDispatcher();
  });

  it("records sent payloads", async () => {
    const payload = makePayload();
    await dispatcher.send(payload);
    expect(dispatcher.sent).toHaveLength(1);
    expect(dispatcher.sent[0]).toEqual(payload);
  });

  it("returns a non-empty message ID", async () => {
    const id = await dispatcher.send(makePayload());
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generates unique message IDs", async () => {
    const id1 = await dispatcher.send(makePayload({ recipientId: "rcp_1" }));
    const id2 = await dispatcher.send(makePayload({ recipientId: "rcp_2" }));
    expect(id1).not.toBe(id2);
  });

  it("accumulates multiple sends", async () => {
    await dispatcher.send(makePayload({ recipientId: "rcp_1" }));
    await dispatcher.send(makePayload({ recipientId: "rcp_2" }));
    await dispatcher.send(makePayload({ recipientId: "rcp_3" }));
    expect(dispatcher.sent).toHaveLength(3);
  });

  it("reset() clears sent records", async () => {
    await dispatcher.send(makePayload());
    await dispatcher.send(makePayload());
    expect(dispatcher.sent).toHaveLength(2);
    dispatcher.reset();
    expect(dispatcher.sent).toHaveLength(0);
  });

  it("preserves payload details accurately", async () => {
    const payload = makePayload({
      kind: "sms",
      to: "+44123456789",
      subject: "",
      body: "Your event starts soon!",
    });
    await dispatcher.send(payload);
    expect(dispatcher.sent[0]!.kind).toBe("sms");
    expect(dispatcher.sent[0]!.to).toBe("+44123456789");
    expect(dispatcher.sent[0]!.body).toBe("Your event starts soon!");
  });
});
