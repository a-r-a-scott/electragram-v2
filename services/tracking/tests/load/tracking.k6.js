/**
 * k6 load test — Tracking Service
 * Target: 5,000 concurrent open/click requests
 * SLO: p99 open pixel < 50ms, p99 click redirect < 100ms
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const openLatency = new Trend("open_pixel_ms", true);
const clickLatency = new Trend("click_redirect_ms", true);
const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    open_tracking: {
      executor: "constant-arrival-rate",
      rate: 2500,
      timeUnit: "1s",
      duration: "3m",
      preAllocatedVUs: 500,
      maxVUs: 1000,
      exec: "testOpenPixel",
    },
    click_tracking: {
      executor: "constant-arrival-rate",
      rate: 2500,
      timeUnit: "1s",
      duration: "3m",
      preAllocatedVUs: 500,
      maxVUs: 1000,
      exec: "testClickRedirect",
    },
  },
  thresholds: {
    open_pixel_ms: ["p(99)<50"],        // p99 < 50ms SLO
    click_redirect_ms: ["p(99)<100"],   // p99 < 100ms SLO
    errors: ["rate<0.001"],             // < 0.1% error rate
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3005";

function randomToken() {
  return Math.random().toString(36).slice(2, 18);
}

export function testOpenPixel() {
  const token = randomToken();
  const start = Date.now();
  const res = http.get(`${BASE_URL}/track/open/${token}.png`, {
    redirects: 0,
  });
  const latency = Date.now() - start;
  openLatency.add(latency);

  const ok = check(res, {
    "returns 200": (r) => r.status === 200,
    "content-type is image/gif": (r) =>
      r.headers["Content-Type"]?.includes("image/gif") ?? false,
    "responds under 50ms": () => latency < 50,
  });
  errorRate.add(!ok);
}

export function testClickRedirect() {
  const token = randomToken();
  const linkId = `lnk_${randomToken()}`;
  const start = Date.now();
  const res = http.get(`${BASE_URL}/track/go/${linkId}/${token}`, {
    redirects: 0,
  });
  const latency = Date.now() - start;
  clickLatency.add(latency);

  const ok = check(res, {
    "returns 302": (r) => r.status === 302,
    "has Location header": (r) => !!r.headers["Location"],
    "responds under 100ms": () => latency < 100,
  });
  errorRate.add(!ok);
}

export function handleSummary(data) {
  const openP99 = data.metrics.open_pixel_ms?.values["p(99)"]?.toFixed(1) ?? "N/A";
  const clickP99 = data.metrics.click_redirect_ms?.values["p(99)"]?.toFixed(1) ?? "N/A";
  const errRate = ((data.metrics.errors?.values.rate ?? 0) * 100).toFixed(3);

  console.log(`
=== Tracking Service Load Test Results ===
Open pixel p99:    ${openP99}ms [SLO: <50ms]
Click redirect p99:${clickP99}ms [SLO: <100ms]
Error rate:        ${errRate}% [SLO: <0.1%]
==========================================
`);
  return {};
}
