/**
 * k6 load test — Delivery Service
 * Target: 10,000+ messages/minute sustained throughput
 * SLO: p99 send latency < 5s
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const sendLatency = new Trend("send_latency_ms", true);

export const options = {
  scenarios: {
    ramp_up: {
      executor: "ramping-arrival-rate",
      startRate: 100,
      timeUnit: "1s",
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { duration: "2m", target: 100 },  // warm up: 100 req/s = 6k/min
        { duration: "5m", target: 167 },  // target: 167 req/s = 10k/min
        { duration: "3m", target: 167 },  // sustain
        { duration: "1m", target: 0 },    // ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(99)<5000"],    // p99 < 5s SLO
    errors: ["rate<0.01"],                // < 1% error rate
    send_latency_ms: ["p(99)<5000"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3004";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "test-token";

export default function () {
  const payload = JSON.stringify({
    messageId: `msg_${Math.random().toString(36).slice(2)}`,
    recipientId: `cnt_${Math.random().toString(36).slice(2)}`,
    channel: "email",
    to: "test@example.com",
    subject: "Test message",
    content: "<p>Hello world</p>",
    releaseId: `rel_${Math.random().toString(36).slice(2)}`,
  });

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/messages/dispatch`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  });
  const latency = Date.now() - start;
  sendLatency.add(latency);

  const success = check(res, {
    "status is 2xx": (r) => r.status >= 200 && r.status < 300,
    "response is JSON": (r) => r.headers["Content-Type"]?.includes("application/json") ?? false,
  });

  errorRate.add(!success);
  sleep(0.001); // minimal sleep to avoid CPU-bound hot loop
}

export function handleSummary(data) {
  console.log(`
=== Delivery Service Load Test Results ===
Total requests:    ${data.metrics.http_reqs.values.count}
Request rate:      ${data.metrics.http_reqs.values.rate.toFixed(1)} req/s
                   (${(data.metrics.http_reqs.values.rate * 60).toFixed(0)} req/min)
p50 latency:       ${data.metrics.http_req_duration.values["p(50)"].toFixed(0)}ms
p95 latency:       ${data.metrics.http_req_duration.values["p(95)"].toFixed(0)}ms
p99 latency:       ${data.metrics.http_req_duration.values["p(99)"].toFixed(0)}ms [SLO: <5000ms]
Error rate:        ${(data.metrics.errors?.values.rate * 100 ?? 0).toFixed(2)}% [SLO: <1%]
==========================================
`);
  return {};
}
