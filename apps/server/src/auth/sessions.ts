import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { sessions, users, type Database } from "@nocap/db";
import type { PublicUser } from "@nocap/shared";

export const SESSION_COOKIE = "nocap_session";

/** The database stores only a hash, so a leaked database does not leak live sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface NewSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(
  db: Database,
  userId: string,
  options: { days: number; ip?: string; userAgent?: string },
): Promise<NewSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + options.days * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: options.ip,
    userAgent: options.userAgent?.slice(0, 300),
  });
  return { token, expiresAt };
}

export async function findSessionUser(db: Database, token: string): Promise<PublicUser | null> {
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteExpiredSessions(db: Database): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
