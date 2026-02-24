import { describe, it, expect } from "vitest";
import { matchRoute } from "../../src/router.js";

describe("GET /health routing", () => {
  it("matchRoute returns health for GET /health", () => {
    expect(matchRoute("GET", "/health")).toBe("health");
  });

  it("matchRoute returns health for GET /api/health", () => {
    expect(matchRoute("GET", "/api/health")).toBe("health");
  });
});
