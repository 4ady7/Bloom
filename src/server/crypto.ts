import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from "node:crypto";

const KEY_LENGTH = 64;

export function newId(): string {
  return randomUUID();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!N || !r || !p || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

let dummyHash: string | null = null;

export function verifyPasswordOrDummy(password: string, stored: string | null): boolean {
  dummyHash ??= hashPassword("not-a-real-password-value");
  const ok = verifyPassword(password, stored ?? dummyHash);
  return stored !== null && ok;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  const chars: string[] = [];
  const limit = INVITE_ALPHABET.length * Math.floor(256 / INVITE_ALPHABET.length);
  while (chars.length < 8) {
    const bytes = randomBytes(16);
    for (const byte of bytes) {
      if (byte < limit) {
        chars.push(INVITE_ALPHABET[byte % INVITE_ALPHABET.length]);
        if (chars.length === 8) break;
      }
    }
  }
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashInviteCode(code: string): string {
  return sha256(normalizeInviteCode(code));
}
