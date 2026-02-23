import { z } from "zod";

import type { Timestamps } from "./common.js";

// ─── User ────────────────────────────────────────────────────────────────────

export const UserRoleSchema = z.enum([
  "normal",
  "admin",
  "demo",
  "super_admin",
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(["active", "inactive"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export interface User extends Timestamps {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  timeZone: string;
  status: UserStatus;
  role: UserRole;
  avatarUrl: string | null;
}

// ─── Account ─────────────────────────────────────────────────────────────────

export const AccountKindSchema = z.enum([
  "individual",
  "organization",
  "demo",
]);
export type AccountKind = z.infer<typeof AccountKindSchema>;

export const AccountStatusSchema = z.enum([
  "onboarding",
  "active",
  "archived",
  "deleted",
]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export interface Account extends Timestamps {
  id: string;
  slug: string;
  name: string;
  kind: AccountKind;
  status: AccountStatus;
  timeZone: string;
  apiKey: string;
}

// ─── AccountUser ─────────────────────────────────────────────────────────────

export interface AccountUser extends Timestamps {
  id: string;
  userId: string;
  accountId: string;
  isOwner: boolean;
  roleId: string | null;
  timeZone: string;
  details: Record<string, unknown>;
}

// ─── Role & Permissions ──────────────────────────────────────────────────────

export interface Role extends Timestamps {
  id: string;
  accountId: string;
  name: string;
  lookupKey: string;
  permissions: Record<string, unknown>;
}

export interface Permission extends Timestamps {
  id: string;
  name: string;
  lookupKey: string;
  description: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const SignInBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type SignInBody = z.infer<typeof SignInBodySchema>;

export const SignUpBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  accountName: z.string().min(1),
});
export type SignUpBody = z.infer<typeof SignUpBodySchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: User;
  account: Account;
  tokens: AuthTokens;
}

// ─── JWT Claims ──────────────────────────────────────────────────────────────

export interface JwtClaims {
  sub: string;
  accountId: string;
  role: UserRole;
  permissions: string[];
  iat: number;
  exp: number;
}
