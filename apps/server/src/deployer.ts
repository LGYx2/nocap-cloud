// The deploy queue. One deployment runs at a time, so builds never fight over the CPU.
//
// A deployment: clone (Git apps) or pull (image apps), build, start a new container next to the
// old one, check that it stays up, then remove the old one. If the new container dies, the old
// one keeps serving, so a bad commit never takes the app down.
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { and, eq, inArray, ne } from "drizzle-orm";
import { applications, deployments, domains, envVars, type Database } from "@nocap/db";
import type { Config } from "./config";
import { SecretBox } from "./crypto";
import type { GitService } from "./git";
import { CommandError, short, type Runtime } from "./runtime";

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface DeployerOptions {
  db: Database;
  config: Config;
  runtime: Runtime;
  log: Logger;
  /** Gives clone access to repositories of connected Git accounts. */
  git?: GitService;
  /** How long a new container must stay up before traffic moves to it. */
  settleMs?: number;
}

const ACTIVE = ["queued", "building"] as const;

export class Deployer {
  private readonly queue: string[] = [];
  private working: Promise<void> | null = null;
  private readonly settleMs: number;

  constructor(private readonly options: DeployerOptions) {
    this.settleMs = options.settleMs ?? 4000;
  }

  private get dataDir() {
    return resolve(this.options.config.DATA_DIR);
  }

  logPath(deploymentId: string) {
    return join(this.dataDir, "logs", `${deploymentId}.log`);
  }

  /** After a restart, deployments that were in progress can never finish: mark them failed. */
  async recover(): Promise<void> {
    const { db } = this.options;
    const stuck = await db
      .update(deployments)
      .set({ status: "failed", error: "Interrupted by a restart of Nocap", finishedAt: new Date() })
      .where(inArray(deployments.status, [...ACTIVE]))
      .returning({ applicationId: deployments.applicationId });
    const ids = [...new Set(stuck.map((row) => row.applicationId))];
    if (ids.length > 0) {
      await db
        .update(applications)
        .set({ status: "failed" })
        .where(and(inArray(applications.id, ids), eq(applications.status, "building")));
    }
  }

  /** Queues a deployment of the app and returns its id right away. */
  async enqueue(applicationId: string, trigger: string): Promise<string> {
    const { db } = this.options;
    const [row] = await db
      .insert(deployments)
      .values({ applicationId, trigger, status: "queued" })
      .returning({ id: deployments.id });
    if (!row) throw new Error("Deployment was not created");
    await db
      .update(deployments)
      .set({ logPath: this.logPath(row.id) })
      .where(eq(deployments.id, row.id));
    this.queue.push(row.id);
    this.kick();
    return row.id;
  }

  private kick(): void {
    if (this.working || this.queue.length === 0) return;
    this.working = this.drain().finally(() => {
      this.working = null;
      this.kick(); // something may have been queued while the last one finished
    });
  }

  /** Resolves when the queue is empty. Used by tests and on shutdown. */
  async idle(): Promise<void> {
    while (this.working) await this.working;
  }

  private async drain(): Promise<void> {
    for (let id = this.queue.shift(); id; id = this.queue.shift()) {
      try {
        await this.deploy(id);
      } catch (err) {
        this.options.log.error({ err, deploymentId: id }, "deployment crashed");
      }
    }
  }

  private async deploy(deploymentId: string): Promise<void> {
    const { db, config, runtime } = this.options;
    mkdirSync(join(this.dataDir, "logs"), { recursive: true });
    const file: WriteStream = createWriteStream(this.logPath(deploymentId), { flags: "a" });
    const log = (line: string) => file.write(`${line}\n`);
    const step = (text: string) => log(`\n==> ${text}`);
    const workdir = join(this.dataDir, "builds", deploymentId);

    const [deployment] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, deploymentId));
    const [app] = deployment
      ? await db.select().from(applications).where(eq(applications.id, deployment.applicationId))
      : [];
    if (!deployment || !app) {
      file.end();
      return;
    }

    await db
      .update(deployments)
      .set({ status: "building", startedAt: new Date() })
      .where(eq(deployments.id, deploymentId));
    await db.update(applications).set({ status: "building" }).where(eq(applications.id, app.id));

    const finish = async (status: "running" | "failed", error: string | null) => {
      await db
        .update(deployments)
        .set({ status, error, finishedAt: new Date() })
        .where(eq(deployments.id, deploymentId));
    };

    try {
      log(`Deployment ${short(deploymentId)} of ${app.name}`);

      // 1. Get the image.
      let image: string;
      if (app.buildType === "image") {
        if (!app.image) throw new DeployError("The app has no image set.");
        step(`Pulling ${app.image}`);
        await runtime.pull(app.image, log);
        image = app.image;
      } else {
        if (!app.repoUrl) throw new DeployError("The app has no repository set.");
        step(`Cloning ${app.repoUrl} (${app.branch})`);
        await rm(workdir, { recursive: true, force: true });
        let cloneUrl = app.repoUrl;
        let cloneLog = log;
        if (app.gitProviderId && this.options.git) {
          const access = await this.options.git
            .cloneUrl(app.gitProviderId, app.repoUrl)
            .catch((err: unknown) => {
              throw new DeployError(
                err instanceof Error ? err.message : "Could not get access to the repository.",
              );
            });
          cloneUrl = access.url;
          // Git can print the address in errors; never let the token reach the log.
          cloneLog = (line: string) => log(line.replaceAll(access.secret, "***"));
          log("Using the connected Git account");
        }
        const commit = await runtime.clone(cloneUrl, app.branch, workdir, cloneLog);
        log(`Commit ${commit.sha.slice(0, 7)}: ${commit.message}`);
        await db
          .update(deployments)
          .set({ commitSha: commit.sha, commitMessage: commit.message.slice(0, 300) })
          .where(eq(deployments.id, deploymentId));

        image = `nocap/${short(app.id)}:${short(deploymentId)}`;
        step(`Building ${app.dockerfilePath}`);
        await runtime.build(workdir, app.dockerfilePath, image, log);
      }
      await db.update(deployments).set({ imageTag: image }).where(eq(deployments.id, deploymentId));

      // 2. Start the new container next to the old one.
      const env = await this.environment(app.id);
      const hosts = await db
        .select({ hostname: domains.hostname })
        .from(domains)
        .where(eq(domains.applicationId, app.id));
      const port = app.port ?? 3000;
      step(`Starting the container on port ${port}`);
      if (hosts.length > 0) log(`Domains: ${hosts.map((h) => `https://${h.hostname}`).join(", ")}`);
      else log("No domain yet: add one in Domains to reach the app from the internet.");
      log(`Environment variables: ${Object.keys(env).length}`);
      const containerId = await runtime.run(
        {
          appId: app.id,
          deploymentId,
          image,
          port,
          env,
          domains: hosts.map((h) => h.hostname),
          network: config.DOCKER_NETWORK,
        },
        log,
      );

      // 3. Make sure it stays up before the old one goes away.
      step("Checking that the app stays up");
      await new Promise((done) => setTimeout(done, this.settleMs));
      if (!(await runtime.isRunning(containerId))) {
        const output = await runtime.logs(containerId, 50).catch(() => "");
        if (output) {
          log("Last lines from the app:");
          for (const line of output.split("\n")) log(`  ${line}`);
        }
        await runtime.remove(containerId).catch(() => undefined);
        throw new DeployError("The app stopped right after it started. Check its logs above.");
      }

      // 4. Switch over: remove older containers and mark older deployments as replaced.
      for (const container of await runtime.containers(app.id)) {
        if (container.id !== containerId && !containerId.startsWith(container.id)) {
          await runtime.remove(container.id).catch(() => undefined);
        }
      }
      await db
        .update(deployments)
        .set({ status: "superseded" })
        .where(
          and(
            eq(deployments.applicationId, app.id),
            eq(deployments.status, "running"),
            ne(deployments.id, deploymentId),
          ),
        );
      await finish("running", null);
      await db.update(applications).set({ status: "running" }).where(eq(applications.id, app.id));
      step("Done. The app is live.");
    } catch (err) {
      const reason =
        err instanceof DeployError
          ? err.message
          : err instanceof CommandError
            ? `${err.message}. See the log for details.`
            : "Unexpected error. See the server logs.";
      if (!(err instanceof DeployError) && !(err instanceof CommandError)) {
        this.options.log.error({ err, deploymentId }, "deployment failed");
      }
      step(`Failed: ${reason}`);
      await finish("failed", reason);
      // If an older container is still serving, the app is still up.
      const stillUp = await runtime
        .containers(app.id)
        .then((list) => list.some((c) => c.running))
        .catch(() => false);
      await db
        .update(applications)
        .set({ status: stillUp ? "running" : "failed" })
        .where(eq(applications.id, app.id));
    } finally {
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
      await new Promise((done) => file.end(done));
    }
  }

  private async environment(applicationId: string): Promise<Record<string, string>> {
    const { db, config } = this.options;
    const rows = await db
      .select({ key: envVars.key, valueEnc: envVars.valueEnc })
      .from(envVars)
      .where(eq(envVars.applicationId, applicationId));
    if (rows.length === 0) return {};
    if (!config.NOCAP_SECRET) throw new DeployError("NOCAP_SECRET is not set on the server.");
    const box = new SecretBox(config.NOCAP_SECRET);
    return Object.fromEntries(rows.map((row) => [row.key, box.open(row.valueEnc)]));
  }
}

/** A failure with a message that is safe and useful to show in the panel. */
class DeployError extends Error {}
