import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";
import { ConsumerService } from "../../src/services/consumer.service.js";
import type { SqsMessage, SqsReceiver } from "../../src/services/consumer.service.js";
import type { SnapshotsService } from "../../src/services/snapshots.service.js";
import type { ActivitiesService } from "../../src/services/activities.service.js";

const silentLog = pino({ level: "silent" });

function makeReceiver(): SqsReceiver & {
  messages: SqsMessage[];
  deleted: string[];
} {
  const state = { messages: [] as SqsMessage[], deleted: [] as string[] };
  return {
    ...state,
    async receiveMessages() { return state.messages; },
    async deleteMessage(_url, receipt) { state.deleted.push(receipt); },
  };
}

function makeSnapshots(): SnapshotsService {
  return { increment: vi.fn().mockResolvedValue(undefined) } as unknown as SnapshotsService;
}

function makeActivities(): ActivitiesService {
  return { record: vi.fn().mockResolvedValue(undefined) } as unknown as ActivitiesService;
}

describe("ConsumerService.processMessage", () => {
  let snapshots: ReturnType<typeof makeSnapshots>;
  let activitiesService: ReturnType<typeof makeActivities>;
  let receiver: ReturnType<typeof makeReceiver>;
  let consumer: ConsumerService;

  beforeEach(() => {
    snapshots = makeSnapshots();
    activitiesService = makeActivities();
    receiver = makeReceiver();
    consumer = new ConsumerService(snapshots, activitiesService, receiver, "https://sqs/test", silentLog);
  });

  it("processes a valid delivery event", async () => {
    const body = JSON.stringify({ kind: "delivered", messageId: "msg_1", accountId: "acc_1", channel: "email" });
    await consumer.processMessage({ MessageId: "m1", ReceiptHandle: "rh1", Body: body });

    expect(snapshots.increment).toHaveBeenCalledOnce();
    expect(activitiesService.record).toHaveBeenCalledOnce();
    expect(receiver.deleted).toContain("rh1");
  });

  it("processes an SNS-wrapped event", async () => {
    const inner = { kind: "sent", messageId: "msg_2", accountId: "acc_2", channel: "sms" };
    const envelope = { Type: "Notification", TopicArn: "arn:...", Message: JSON.stringify(inner) };
    await consumer.processMessage({ MessageId: "m2", ReceiptHandle: "rh2", Body: JSON.stringify(envelope) });

    expect(snapshots.increment).toHaveBeenCalledWith(expect.objectContaining({ kind: "sent" }));
    expect(receiver.deleted).toContain("rh2");
  });

  it("deletes unparseable messages without retrying", async () => {
    await consumer.processMessage({ MessageId: "m3", ReceiptHandle: "rh3", Body: "bad-json" });

    expect(snapshots.increment).not.toHaveBeenCalled();
    expect(receiver.deleted).toContain("rh3");
  });

  it("skips empty body messages and deletes them", async () => {
    await consumer.processMessage({ MessageId: "m4", ReceiptHandle: "rh4", Body: "" });

    expect(snapshots.increment).not.toHaveBeenCalled();
    expect(receiver.deleted).toContain("rh4");
  });

  it("does NOT delete message when processing throws (allow retry)", async () => {
    vi.mocked(snapshots.increment).mockRejectedValue(new Error("DB error"));
    const body = JSON.stringify({ kind: "delivered", messageId: "msg_5", accountId: "acc_5", channel: "email" });

    await consumer.processMessage({ MessageId: "m5", ReceiptHandle: "rh5", Body: body });

    expect(receiver.deleted).not.toContain("rh5");
  });

  it("handles message with no ReceiptHandle (no delete attempt)", async () => {
    const body = JSON.stringify({ kind: "opened", messageId: "msg_6", accountId: "acc_6", channel: "email" });
    await expect(
      consumer.processMessage({ MessageId: "m6", Body: body }),
    ).resolves.not.toThrow();
  });

  it("calls increment with the correct event shape", async () => {
    const event = { kind: "clicked", messageId: "msg_7", accountId: "acc_7", channel: "email", url: "https://ex.com", day: "2025-01-15" };
    await consumer.processMessage({ MessageId: "m7", ReceiptHandle: "rh7", Body: JSON.stringify(event) });

    expect(snapshots.increment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "clicked", url: "https://ex.com", day: "2025-01-15" }),
    );
  });

  it("stop() prevents new polling cycles", () => {
    consumer.stop();
    // Internal state check
    expect((consumer as unknown as { stopped: boolean }).stopped).toBe(true);
  });
});
