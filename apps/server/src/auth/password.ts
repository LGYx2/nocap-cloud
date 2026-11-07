import { hash, verify } from "@node-rs/argon2";

// Argon2id with the OWASP-recommended baseline: 19 MiB memory, 2 iterations, 1 lane.
const options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real check, so a login for an unknown email
 * takes as long as one for a known email with a wrong password.
 */
export async function fakeVerify(password: string): Promise<false> {
  dummyHash ??= hashPassword("nocap-timing-equaliser");
  await verifyPassword(await dummyHash, password);
  return false;
}
