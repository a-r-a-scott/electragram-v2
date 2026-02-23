import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  12
);

export function generateId(prefix: string): string {
  return `${prefix}_${nanoid()}`;
}

export function generateToken(): string {
  return customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    40
  )();
}

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

export function buildGuestDupeKey(
  firstName: string,
  lastName: string,
  email?: string | null
): string {
  return [
    firstName.toLowerCase().trim(),
    lastName.toLowerCase().trim(),
    email?.toLowerCase().trim() ?? "",
  ].join("|");
}

export function buildSearchText(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
