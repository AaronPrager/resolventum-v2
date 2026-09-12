import bcrypt from "bcryptjs";

/** v1 hashes are bcrypt cost 10 ($2b$); bcryptjs reads and writes the same format. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}
