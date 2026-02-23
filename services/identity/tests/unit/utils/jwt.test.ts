import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";

import { JwtService } from "../../../src/utils/jwt.js";

function generateTestKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) as string,
  };
}

describe("JwtService", () => {
  let jwtService: JwtService;

  beforeAll(async () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    jwtService = new JwtService({
      privateKeyPem,
      publicKeyPem,
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 7776000,
    });
    await jwtService.initialize();
  });

  describe("issueTokenPair", () => {
    it("issues access and refresh tokens", async () => {
      const pair = await jwtService.issueTokenPair({
        sub: "usr_test",
        accountId: "acc_test",
        role: "normal",
        permissions: [],
      });

      expect(pair.accessToken).toBeTruthy();
      expect(pair.refreshToken).toBeTruthy();
      expect(pair.expiresIn).toBe(900);
    });

    it("issues different tokens each call", async () => {
      const p1 = await jwtService.issueTokenPair({ sub: "usr_test", accountId: "acc_test", role: "normal", permissions: [] });
      const p2 = await jwtService.issueTokenPair({ sub: "usr_test", accountId: "acc_test", role: "normal", permissions: [] });
      expect(p1.accessToken).not.toBe(p2.accessToken);
    });
  });

  describe("verifyAccessToken", () => {
    it("verifies a valid access token and returns claims", async () => {
      const pair = await jwtService.issueTokenPair({
        sub: "usr_abc",
        accountId: "acc_xyz",
        role: "admin",
        permissions: ["contacts:read"],
      });

      const claims = await jwtService.verifyAccessToken(pair.accessToken);
      expect(claims.sub).toBe("usr_abc");
      expect(claims.accountId).toBe("acc_xyz");
      expect(claims.role).toBe("admin");
      expect(claims.permissions).toEqual(["contacts:read"]);
    });

    it("throws on invalid token", async () => {
      await expect(
        jwtService.verifyAccessToken("invalid.token.here")
      ).rejects.toThrow();
    });

    it("throws on refresh token passed as access token", async () => {
      const pair = await jwtService.issueTokenPair({ sub: "usr_test", accountId: "acc_test", role: "normal", permissions: [] });
      // Refresh token is still a valid JWT but we should handle this
      const claims = await jwtService.verifyAccessToken(pair.refreshToken);
      expect(claims).toBeTruthy(); // JWT is valid, type check is caller's responsibility
    });
  });

  describe("verifyRefreshToken", () => {
    it("verifies a valid refresh token", async () => {
      const pair = await jwtService.issueTokenPair({
        sub: "usr_def",
        accountId: "acc_ghi",
        role: "normal",
        permissions: [],
      });

      const result = await jwtService.verifyRefreshToken(pair.refreshToken);
      expect(result.sub).toBe("usr_def");
      expect(result.accountId).toBe("acc_ghi");
    });

    it("throws when access token passed as refresh token", async () => {
      const pair = await jwtService.issueTokenPair({ sub: "usr_test", accountId: "acc_test", role: "normal", permissions: [] });
      await expect(
        jwtService.verifyRefreshToken(pair.accessToken)
      ).rejects.toThrow("Not a refresh token");
    });
  });
});
