import { statfs } from "node:fs/promises";
import os from "node:os";
import type { ServerStats } from "@nocap/shared";

/** CPU load, memory and disk of the machine Nocap runs on. */
export async function serverStats(dataDir: string): Promise<ServerStats> {
  const cpus = os.cpus().length || 1;
  let disk: ServerStats["disk"] = null;
  try {
    const fs = await statfs(dataDir).catch(() => statfs("."));
    const total = fs.blocks * fs.bsize;
    disk = { total, used: total - fs.bavail * fs.bsize };
  } catch {
    // Not available on this platform.
  }
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    cpus,
    load: Math.round(((os.loadavg()[0] ?? 0) / cpus) * 100) / 100,
    memory: { total: os.totalmem(), used: os.totalmem() - os.freemem() },
    disk,
    uptime: Math.round(os.uptime()),
  };
}
