import { describe, it, expect } from "vitest";
import { buildApp } from "../../src/app.js";

describe("GET /health", () => {
  it("returns 200 with ok status", async () => {
    const app = await buildApp({
      databaseUrl: "postgres://localhost/test",
      runMigrations: false,
      nodeEnv: "test",
    });

    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; service: string }>();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("integrations");
    await app.close();
  });
});
