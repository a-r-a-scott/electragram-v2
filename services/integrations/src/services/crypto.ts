/**
 * AES-256-GCM encryption for credential secrets.
 * Key is derived from the ENCRYPTION_KEY env var (32 hex bytes = 64 hex chars).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars)");

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: <iv_hex>:<tag_hex>:<ciphertext_hex>
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars)");

  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, tagHex, dataHex] = parts as [string, string, string];

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Encrypt a JSON object of secrets */
export function encryptSecrets(secrets: Record<string, unknown>, keyHex: string): string {
  return encrypt(JSON.stringify(secrets), keyHex);
}

/** Decrypt and parse a secrets JSON object */
export function decryptSecrets(ciphertext: string, keyHex: string): Record<string, unknown> {
  const plaintext = decrypt(ciphertext, keyHex);
  return JSON.parse(plaintext) as Record<string, unknown>;
}
