import { randomBytes, timingSafeEqual, scryptSync, createHash } from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `s1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [tag, n, r, p, salt, expectedHex] = stored.split("$");
    if (tag !== "s1" || !n || !r || !p || !salt || !expectedHex) return false;
    const derived = scryptSync(plain, salt, KEY_LEN, { N: Number(n), r: Number(r), p: Number(p) });
    const expected = Buffer.from(expectedHex, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}
