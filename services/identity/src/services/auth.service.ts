import { eq, and } from "drizzle-orm";

import type {
  AuthResponse,
  SignInBody,
  SignUpBody,
  User,
  Account,
} from "@electragram/types";

import type { Db } from "../db/client.js";
import { users, accounts, accountUsers, userSessions } from "../db/schema.js";
import { generateId, generateApiKey, generateSlug } from "../utils/id.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import type { JwtService } from "../utils/jwt.js";

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly jwt: JwtService
  ) {}

  async signIn(body: SignInBody, ipAddress?: string): Promise<AuthResponse> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (!user || !user.passwordDigest) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await verifyPassword(body.password, user.passwordDigest);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.status !== "active") {
      throw new UnauthorizedError("Account is inactive");
    }

    const [accountUser] = await this.db
      .select({ accountId: accountUsers.accountId })
      .from(accountUsers)
      .where(eq(accountUsers.userId, user.id))
      .limit(1);

    if (!accountUser) {
      throw new UnauthorizedError("No account found for user");
    }

    const [account] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountUser.accountId))
      .limit(1);

    if (!account) {
      throw new UnauthorizedError("Account not found");
    }

    const tokens = await this.jwt.issueTokenPair({
      sub: user.id,
      accountId: account.id,
      role: user.role,
      permissions: [],
    });

    await this.createSession(user.id, tokens.refreshToken, ipAddress);

    return {
      user: mapUser(user),
      account: mapAccount(account),
      tokens,
    };
  }

  async signUp(body: SignUpBody, ipAddress?: string): Promise<AuthResponse> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError("Email already registered");
    }

    const passwordDigest = await hashPassword(body.password);
    const userId = generateId("usr");
    const accountId = generateId("acc");
    const slug = generateSlug(body.accountName);

    const [user] = await this.db
      .insert(users)
      .values({
        id: userId,
        email: body.email.toLowerCase(),
        passwordDigest,
        firstName: body.firstName,
        lastName: body.lastName,
        timeZone: "UTC",
        status: "active",
        role: "normal",
      })
      .returning();

    if (!user) throw new Error("Failed to create user");

    const [account] = await this.db
      .insert(accounts)
      .values({
        id: accountId,
        slug: await this.uniqueSlug(slug),
        name: body.accountName,
        kind: "organization",
        status: "active",
        timeZone: "UTC",
        apiKey: generateApiKey(),
      })
      .returning();

    if (!account) throw new Error("Failed to create account");

    await this.db.insert(accountUsers).values({
      id: generateId("acu"),
      userId: user.id,
      accountId: account.id,
      isOwner: true,
      timeZone: "UTC",
      details: {},
    });

    const tokens = await this.jwt.issueTokenPair({
      sub: user.id,
      accountId: account.id,
      role: user.role,
      permissions: [],
    });

    await this.createSession(user.id, tokens.refreshToken, ipAddress);

    return {
      user: mapUser(user),
      account: mapAccount(account),
      tokens,
    };
  }

  async refreshTokens(
    refreshToken: string
  ): Promise<Pick<AuthResponse, "tokens">> {
    const { sub, accountId } = await this.jwt.verifyRefreshToken(refreshToken);

    const [session] = await this.db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.userId, sub),
          eq(userSessions.persistenceToken, refreshToken),
          eq(userSessions.revoked, false)
        )
      )
      .limit(1);

    if (!session) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token expired");
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, sub))
      .limit(1);

    if (!user) throw new UnauthorizedError("User not found");

    const tokens = await this.jwt.issueTokenPair({
      sub: user.id,
      accountId,
      role: user.role,
      permissions: [],
    });

    await this.db
      .update(userSessions)
      .set({
        persistenceToken: tokens.refreshToken,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000 * 6 * 24 * 90),
      })
      .where(eq(userSessions.id, session.id));

    return { tokens };
  }

  async signOut(refreshToken: string): Promise<void> {
    await this.db
      .update(userSessions)
      .set({ revoked: true, updatedAt: new Date() })
      .where(eq(userSessions.persistenceToken, refreshToken));
  }

  private async createSession(
    userId: string,
    refreshToken: string,
    ipAddress?: string
  ): Promise<void> {
    const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await this.db.insert(userSessions).values({
      id: generateId("ses"),
      userId,
      persistenceToken: refreshToken,
      ipAddress: ipAddress ?? null,
      revoked: false,
      source: "signin",
      expiresAt: ninetyDaysFromNow,
    });
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let attempt = 0;
    while (true) {
      const existing = await this.db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.slug, slug))
        .limit(1);

      if (existing.length === 0) return slug;
      attempt++;
      slug = `${base}-${attempt}`;
    }
  }
}

function mapUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phoneNumber: row.phoneNumber ?? null,
    timeZone: row.timeZone,
    status: row.status,
    role: row.role,
    avatarUrl: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapAccount(row: typeof accounts.$inferSelect): Account {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    status: row.status,
    timeZone: row.timeZone,
    apiKey: row.apiKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
