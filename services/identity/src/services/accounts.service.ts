import { eq, and } from "drizzle-orm";

import type { Account, AccountUser } from "@electragram/types";

import type { Db } from "../db/client.js";
import { accounts, accountUsers, users } from "../db/schema.js";
import { NotFoundError, ForbiddenError } from "./errors.js";

export class AccountsService {
  constructor(private readonly db: Db) {}

  async getAccount(accountId: string, requestingUserId: string): Promise<Account> {
    await this.requireMembership(accountId, requestingUserId);

    const [account] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!account) throw new NotFoundError("Account not found");

    return mapAccount(account);
  }

  async listUserAccounts(userId: string): Promise<Account[]> {
    const memberships = await this.db
      .select({ accountId: accountUsers.accountId })
      .from(accountUsers)
      .where(eq(accountUsers.userId, userId));

    if (memberships.length === 0) return [];

    const accountIds = memberships.map((m) => m.accountId);
    const rows = await this.db
      .select()
      .from(accounts)
      .where(
        accountIds.length === 1
          ? eq(accounts.id, accountIds[0]!)
          : accounts.id.in(accountIds)
      );

    return rows.map(mapAccount);
  }

  async updateAccount(
    accountId: string,
    requestingUserId: string,
    data: Partial<{ name: string; timeZone: string }>
  ): Promise<Account> {
    await this.requireOwnership(accountId, requestingUserId);

    const [updated] = await this.db
      .update(accounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(accounts.id, accountId))
      .returning();

    if (!updated) throw new NotFoundError("Account not found");
    return mapAccount(updated);
  }

  async listMembers(
    accountId: string,
    requestingUserId: string
  ): Promise<Array<AccountUser & { userEmail: string; userName: string }>> {
    await this.requireMembership(accountId, requestingUserId);

    const rows = await this.db
      .select({
        accountUser: accountUsers,
        user: { email: users.email, firstName: users.firstName, lastName: users.lastName },
      })
      .from(accountUsers)
      .innerJoin(users, eq(accountUsers.userId, users.id))
      .where(eq(accountUsers.accountId, accountId));

    return rows.map(({ accountUser, user }) => ({
      id: accountUser.id,
      userId: accountUser.userId,
      accountId: accountUser.accountId,
      isOwner: accountUser.isOwner,
      roleId: accountUser.roleId,
      timeZone: accountUser.timeZone,
      details: accountUser.details as Record<string, unknown>,
      createdAt: accountUser.createdAt.toISOString(),
      updatedAt: accountUser.updatedAt.toISOString(),
      userEmail: user.email,
      userName: `${user.firstName} ${user.lastName}`,
    }));
  }

  async removeMember(
    accountId: string,
    targetUserId: string,
    requestingUserId: string
  ): Promise<void> {
    await this.requireOwnership(accountId, requestingUserId);

    const [membership] = await this.db
      .select()
      .from(accountUsers)
      .where(
        and(
          eq(accountUsers.accountId, accountId),
          eq(accountUsers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!membership) throw new NotFoundError("Member not found");
    if (membership.isOwner) {
      throw new ForbiddenError("Cannot remove the account owner");
    }

    await this.db
      .delete(accountUsers)
      .where(eq(accountUsers.id, membership.id));
  }

  private async requireMembership(
    accountId: string,
    userId: string
  ): Promise<void> {
    const [membership] = await this.db
      .select({ id: accountUsers.id })
      .from(accountUsers)
      .where(
        and(
          eq(accountUsers.accountId, accountId),
          eq(accountUsers.userId, userId)
        )
      )
      .limit(1);

    if (!membership) throw new ForbiddenError("Access denied");
  }

  private async requireOwnership(
    accountId: string,
    userId: string
  ): Promise<void> {
    const [membership] = await this.db
      .select({ isOwner: accountUsers.isOwner })
      .from(accountUsers)
      .where(
        and(
          eq(accountUsers.accountId, accountId),
          eq(accountUsers.userId, userId)
        )
      )
      .limit(1);

    if (!membership || !membership.isOwner) {
      throw new ForbiddenError("Only the account owner can perform this action");
    }
  }
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
