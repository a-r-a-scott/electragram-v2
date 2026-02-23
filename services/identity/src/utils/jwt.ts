import { SignJWT, jwtVerify, importPKCS8, importSPKI, type KeyLike } from "jose";

import type { JwtClaims } from "@electragram/types";

export interface JwtConfig {
  privateKeyPem: string;
  publicKeyPem: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class JwtService {
  private privateKey!: KeyLike;
  private publicKey!: KeyLike;

  constructor(private readonly config: JwtConfig) {}

  async initialize(): Promise<void> {
    this.privateKey = await importPKCS8(this.config.privateKeyPem, "RS256");
    this.publicKey = await importSPKI(this.config.publicKeyPem, "RS256");
  }

  async issueTokenPair(claims: Omit<JwtClaims, "iat" | "exp">): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({
      ...claims,
      type: "access",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.accessTokenTtlSeconds)
      .sign(this.privateKey);

    const refreshToken = await new SignJWT({
      sub: claims.sub,
      accountId: claims.accountId,
      type: "refresh",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.refreshTokenTtlSeconds)
      .sign(this.privateKey);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenTtlSeconds,
    };
  }

  async verifyAccessToken(token: string): Promise<JwtClaims> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      algorithms: ["RS256"],
    });
    return payload as unknown as JwtClaims;
  }

  async verifyRefreshToken(
    token: string
  ): Promise<{ sub: string; accountId: string }> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      algorithms: ["RS256"],
    });
    if (payload["type"] !== "refresh") {
      throw new Error("Not a refresh token");
    }
    return {
      sub: payload.sub as string,
      accountId: payload["accountId"] as string,
    };
  }
}
