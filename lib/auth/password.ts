// Password hashing with scrypt (Node's built-in, memory-hard). Format: scrypt$N$r$p$salt$hash (base64url).
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n = N, r = R, p = P): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash to compare against when the email is unknown, so timing doesn't reveal which emails exist. */
export const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

export type PasswordProblem = string | null;

/** Plain rules: at least 10 characters, not all one kind, not the email or name. */
export function passwordProblem(password: string, ctx: { email?: string; name?: string } = {}): PasswordProblem {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  if (/^(.)\1+$/.test(password)) return "Don't repeat one character.";
  const lower = password.toLowerCase();
  if (ctx.email && lower.includes(ctx.email.toLowerCase().split("@")[0])) return "Don't use your email address in the password.";
  if (ctx.name && ctx.name.length >= 3 && lower.includes(ctx.name.toLowerCase())) return "Don't use your name in the password.";
  if (["password", "atliq", "1234567890", "qwerty"].some((w) => lower.includes(w))) return "Avoid common words like “password” or “atliq”.";
  return null;
}

/** A readable temporary password for new or reset accounts (shown once to the admin). */
export function temporaryPassword(): string {
  const words = ["amber", "cedar", "delta", "ember", "falcon", "harbor", "indigo", "juniper", "kestrel", "lumen", "maple", "nimbus", "orchid", "quartz", "raven", "sierra", "tundra", "willow"];
  const pick = () => words[randomBytes(1)[0] % words.length];
  return `${pick()}-${pick()}-${randomBytes(2).readUInt16BE(0) % 9000 + 1000}`;
}
