import { describe, it, expect } from "vitest";
import { matchRoute } from "../../src/router.js";

describe("matchRoute", () => {
  it("matches GET /health", () => {
    expect(matchRoute("GET", "/health")).toBe("health");
  });

  it("matches POST /media/uploads/presign", () => {
    expect(matchRoute("POST", "/media/uploads/presign")).toBe("presign");
  });

  it("matches POST /api/media/uploads/presign (with /api prefix)", () => {
    expect(matchRoute("POST", "/api/media/uploads/presign")).toBe("presign");
  });

  it("matches POST /media/uploads/:id/process", () => {
    expect(matchRoute("POST", "/media/uploads/abc123/process")).toBe("process");
  });

  it("matches GET /media/uploads/:id", () => {
    expect(matchRoute("GET", "/media/uploads/abc123")).toBe("get-upload");
  });

  it("does not match GET /media/uploads/:id/process", () => {
    expect(matchRoute("GET", "/media/uploads/abc123/process")).toBeNull();
  });

  it("matches POST /media/exports", () => {
    expect(matchRoute("POST", "/media/exports")).toBe("create-export");
  });

  it("matches GET /media/exports/:id", () => {
    expect(matchRoute("GET", "/media/exports/exp_123")).toBe("get-export");
  });

  it("returns null for unknown routes", () => {
    expect(matchRoute("GET", "/unknown")).toBeNull();
    expect(matchRoute("DELETE", "/media/uploads/xyz")).toBeNull();
  });

  it("is case-insensitive for method", () => {
    expect(matchRoute("post", "/media/uploads/presign")).toBe("presign");
    expect(matchRoute("get", "/health")).toBe("health");
  });
});
