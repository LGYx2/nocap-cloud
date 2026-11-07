import { auditLogs, type Database } from "@nocap/db";

export interface AuditEntry {
  action: string;
  userId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Writes one line to the audit log. Never throws: a failed audit write must not break a request. */
export async function audit(
  db: Database,
  entry: AuditEntry,
  log?: { error: (obj: unknown, msg: string) => void },
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action: entry.action,
      userId: entry.userId ?? null,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata,
      ip: entry.ip,
    });
  } catch (err) {
    log?.error({ err, action: entry.action }, "audit log write failed");
  }
}
