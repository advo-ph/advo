import { timingSafeEqual } from "node:crypto";

/** Compare `Authorization: Bearer <secret>` without leaking length via early return on content. */
export function importSecretOk(header: string | undefined, secret: string): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const got = Buffer.from(header.slice(7));
  const want = Buffer.from(secret);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}
