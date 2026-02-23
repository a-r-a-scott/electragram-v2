import { describe, it, expect } from "vitest";
import { parseEventBody, todayUtc } from "../../src/services/events.js";

describe("parseEventBody", () => {
  it("parses a direct JSON delivery event", () => {
    const event = { kind: "delivered", messageId: "msg_1", accountId: "acc_1", channel: "email" };
    const result = parseEventBody(JSON.stringify(event));
    expect(result.kind).toBe("delivered");
    expect(result.messageId).toBe("msg_1");
    expect(result.accountId).toBe("acc_1");
    expect(result.channel).toBe("email");
  });

  it("unwraps an SNS notification envelope", () => {
    const inner = { kind: "opened", messageId: "msg_2", accountId: "acc_2", channel: "email" };
    const envelope = {
      Type: "Notification",
      TopicArn: "arn:aws:sns:us-east-1:123:delivery-events",
      Message: JSON.stringify(inner),
    };
    const result = parseEventBody(JSON.stringify(envelope));
    expect(result.kind).toBe("opened");
    expect(result.messageId).toBe("msg_2");
  });

  it("throws on non-JSON input", () => {
    expect(() => parseEventBody("not-json")).toThrow("Non-JSON SQS message body");
  });

  it("throws on SNS envelope with non-JSON Message field", () => {
    const envelope = {
      Type: "Notification",
      TopicArn: "arn:aws:sns:us-east-1:123:delivery-events",
      Message: "not-json",
    };
    expect(() => parseEventBody(JSON.stringify(envelope))).toThrow("SNS Message field is not valid JSON");
  });

  it("throws when required fields are missing", () => {
    const broken = { kind: "delivered" }; // missing messageId + accountId
    expect(() => parseEventBody(JSON.stringify(broken))).toThrow("missing required fields");
  });

  it("parses a clicked event with url", () => {
    const event = {
      kind: "clicked",
      messageId: "msg_3",
      accountId: "acc_3",
      channel: "email",
      url: "https://example.com/link",
    };
    const result = parseEventBody(JSON.stringify(event));
    expect(result.url).toBe("https://example.com/link");
  });

  it("accepts event with day field", () => {
    const event = { kind: "sent", messageId: "msg_4", accountId: "acc_4", channel: "email", day: "2025-01-15" };
    const result = parseEventBody(JSON.stringify(event));
    expect(result.day).toBe("2025-01-15");
  });
});

describe("todayUtc", () => {
  it("returns a valid ISO date string", () => {
    const today = todayUtc();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
