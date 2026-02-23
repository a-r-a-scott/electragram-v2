import { describe, it, expect } from "vitest";
import { encrypt, decrypt, encryptSecrets, decryptSecrets } from "../../src/services/crypto.js";

const TEST_KEY = "a".repeat(64); // 32 bytes as hex

describe("encrypt / decrypt", () => {
  it("round-trips a string", () => {
    const plaintext = "hello world";
    const ciphertext = encrypt(plaintext, TEST_KEY);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext, TEST_KEY)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const c1 = encrypt("same", TEST_KEY);
    const c2 = encrypt("same", TEST_KEY);
    expect(c1).not.toBe(c2);
  });

  it("ciphertext format is iv:tag:data", () => {
    const c = encrypt("test", TEST_KEY);
    expect(c.split(":")).toHaveLength(3);
  });

  it("throws on wrong key", () => {
    const c = encrypt("secret", TEST_KEY);
    const wrongKey = "b".repeat(64);
    expect(() => decrypt(c, wrongKey)).toThrow();
  });

  it("throws on malformed ciphertext", () => {
    expect(() => decrypt("bad:data", TEST_KEY)).toThrow("Invalid ciphertext format");
  });

  it("throws when key is wrong length", () => {
    expect(() => encrypt("test", "short")).toThrow("32 bytes");
    expect(() => decrypt("iv:tag:data", "short")).toThrow("32 bytes");
  });
});

describe("encryptSecrets / decryptSecrets", () => {
  it("round-trips a secrets object", () => {
    const secrets = { accessToken: "tok_abc", refreshToken: "ref_xyz", extra: { dc: "us1" } };
    const encrypted = encryptSecrets(secrets, TEST_KEY);
    const decrypted = decryptSecrets(encrypted, TEST_KEY);
    expect(decrypted["accessToken"]).toBe("tok_abc");
    expect(decrypted["refreshToken"]).toBe("ref_xyz");
    expect((decrypted["extra"] as Record<string, string>)["dc"]).toBe("us1");
  });

  it("encrypts to a non-JSON string", () => {
    const encrypted = encryptSecrets({ key: "value" }, TEST_KEY);
    expect(() => JSON.parse(encrypted)).toThrow();
  });
});
