import { describe, it, expect } from "vitest";
import { parseInboundEvent, channelFromKind } from "../../src/services/inbound.events.js";

describe("parseInboundEvent", () => {
  it("parses a direct JSON inbound_sms event", () => {
    const event = { kind: "inbound_sms", from: "+447700900123", to: "+441234567890", body: "Hello", messageSid: "SM123" };
    const result = parseInboundEvent(JSON.stringify(event));
    expect(result.kind).toBe("inbound_sms");
    expect(result.from).toBe("+447700900123");
    expect(result.to).toBe("+441234567890");
    expect(result.body).toBe("Hello");
  });

  it("parses a direct JSON inbound_whatsapp event", () => {
    const event = { kind: "inbound_whatsapp", from: "+447700900123", to: "+441234567890", body: "Hi there", messageSid: "SM456" };
    const result = parseInboundEvent(JSON.stringify(event));
    expect(result.kind).toBe("inbound_whatsapp");
  });

  it("unwraps an SNS envelope", () => {
    const inner = { kind: "inbound_sms", from: "+1555", to: "+1999", body: "test", messageSid: "SM789" };
    const envelope = { Type: "Notification", TopicArn: "arn:...", Message: JSON.stringify(inner) };
    const result = parseInboundEvent(JSON.stringify(envelope));
    expect(result.kind).toBe("inbound_sms");
    expect(result.messageSid).toBe("SM789");
  });

  it("throws on non-JSON input", () => {
    expect(() => parseInboundEvent("not-json")).toThrow("Non-JSON SQS body");
  });

  it("throws on SNS envelope with non-JSON Message", () => {
    const envelope = { Type: "Notification", TopicArn: "arn:...", Message: "bad" };
    expect(() => parseInboundEvent(JSON.stringify(envelope))).toThrow("SNS Message field is not valid JSON");
  });

  it("throws when required fields are missing", () => {
    expect(() => parseInboundEvent(JSON.stringify({ kind: "inbound_sms" }))).toThrow("missing required fields");
  });

  it("includes mediaUrls when present", () => {
    const event = { kind: "inbound_sms", from: "+1", to: "+2", body: "pic", messageSid: "SM1", mediaUrls: ["https://example.com/img.jpg"] };
    const result = parseInboundEvent(JSON.stringify(event));
    expect(result.mediaUrls).toHaveLength(1);
  });
});

describe("channelFromKind", () => {
  it("returns sms for inbound_sms", () => {
    expect(channelFromKind("inbound_sms")).toBe("sms");
  });

  it("returns whatsapp for inbound_whatsapp", () => {
    expect(channelFromKind("inbound_whatsapp")).toBe("whatsapp");
  });
});
