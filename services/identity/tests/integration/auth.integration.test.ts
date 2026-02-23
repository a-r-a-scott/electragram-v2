import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";

import { buildApp } from "../../src/app.js";
import { createDb, closeDb } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";

function testKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) as string,
  };
}

describe("Auth API — Integration", () => {
  let container: StartedPostgreSqlContainer;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("identity_test")
      .withUsername("test")
      .withPassword("test")
      .start();

    const databaseUrl = container.getConnectionUri();
    const db = createDb(databaseUrl);
    await runMigrations(db);

    const { privateKeyPem, publicKeyPem } = testKeyPair();
    app = await buildApp({ databaseUrl, jwtPrivateKeyPem: privateKeyPem, jwtPublicKeyPem: publicKeyPem, nodeEnv: "test" });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await closeDb();
    await container.stop();
  });

  describe("POST /api/auth/signup", () => {
    it("creates a user and account and returns tokens", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        body: {
          email: "test@example.com",
          password: "password123",
          firstName: "Jane",
          lastName: "Doe",
          accountName: "Test Corp",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { success: boolean; data: { user: { email: string }; tokens: { accessToken: string } } };
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe("test@example.com");
      expect(body.data.tokens.accessToken).toBeTruthy();
    });

    it("returns 409 for duplicate email", async () => {
      const payload = {
        email: "duplicate@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        accountName: "Corp 1",
      };
      await app.inject({ method: "POST", url: "/api/auth/signup", body: payload });
      const res = await app.inject({ method: "POST", url: "/api/auth/signup", body: payload });
      expect(res.statusCode).toBe(409);
    });

    it("returns 400 for invalid email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        body: { email: "not-an-email", password: "password123", firstName: "A", lastName: "B", accountName: "X" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/auth/signin", () => {
    beforeAll(async () => {
      await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        body: { email: "signin@example.com", password: "password123", firstName: "Sign", lastName: "In", accountName: "Sign Corp" },
      });
    });

    it("returns tokens for valid credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signin",
        body: { email: "signin@example.com", password: "password123" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { success: boolean; data: { tokens: { accessToken: string; refreshToken: string } } };
      expect(body.data.tokens.accessToken).toBeTruthy();
      expect(body.data.tokens.refreshToken).toBeTruthy();
    });

    it("returns 401 for wrong password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signin",
        body: { email: "signin@example.com", password: "wrongpassword" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 for non-existent user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signin",
        body: { email: "ghost@example.com", password: "password123" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("returns new tokens for valid refresh token", async () => {
      const signupRes = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        body: { email: "refresh@example.com", password: "password123", firstName: "Ref", lastName: "Resh", accountName: "Refresh Corp" },
      });
      const { data } = JSON.parse(signupRes.body) as { data: { tokens: { refreshToken: string } } };

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        body: { refreshToken: data.tokens.refreshToken },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { tokens: { accessToken: string } } };
      expect(body.data.tokens.accessToken).toBeTruthy();
    });

    it("returns 401 for invalid refresh token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        body: { refreshToken: "bogus.token.here" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /health", () => {
    it("returns 200 and service name", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { status: string; service: string };
      expect(body.status).toBe("ok");
      expect(body.service).toBe("identity");
    });
  });
});
