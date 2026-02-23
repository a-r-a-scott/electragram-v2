import { describe, it, expect } from "vitest";
import { buildApp } from "../../src/app.js";

describe("GET /health", () => {
  it("returns 200 with service name", async () => {
    const app = await buildApp({ databaseUrl: "postgresql://test:test@localhost/test", nodeEnv: "test" });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("design");
  });
});
