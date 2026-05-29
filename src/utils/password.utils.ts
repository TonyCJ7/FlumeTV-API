import argon2 from "argon2";

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

export async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, plainPassword);
  } catch {
    return false;
  }
}
