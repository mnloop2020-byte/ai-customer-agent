import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const iterations = 210_000;
const keyLength = 32;
const digest = "sha256";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");

  return `pbkdf2:${iterations}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, iterationText, salt, hash] = storedHash.split(":");

  if (scheme !== "pbkdf2" || !iterationText || !salt || !hash) return false;

  const derived = pbkdf2Sync(password, salt, Number(iterationText), keyLength, digest);
  const expected = Buffer.from(hash, "hex");

  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

