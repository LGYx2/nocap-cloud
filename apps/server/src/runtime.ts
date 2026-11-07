// How Nocap talks to Docker and Git. The real runtime runs the `docker` and `git` command line
// tools (both are in the Nocap image, and the Docker socket is mounted into the container).
// Tests use FakeRuntime instead, so they need neither.
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type { AppAction, DockerInfo } from "@nocap/shared";

/** Receives build output one line at a time. */
export type LogLine = (line: string) => void;

export interface RunOptions {
  appId: string;
  deploymentId: string;
  image: string;
  port: number;
  env: Record<string, string>;
  domains: string[];
  network: string;
}

export interface AppContainer {
  id: string;
  deploymentId: string;
  running: boolean;
}

export interface DatabaseRunOptions {
  databaseId: string;
  /** Container name, also its hostname on the network. */
  name: string;
  image: string;
  env: Record<string, string>;
  volume: string;
  dataPath: string;
  command?: string[];
  network: string;
}

export interface ReleaseOptions {
  name: string;
  image: string;
  env: Record<string, string>;
  /** One shell command line, run with `sh -c`. */
  command: string;
  network: string;
}

export interface ContainerStats {
  name: string;
  /** Percent of one core. */
  cpu: number;
  /** Bytes. */
  memory: number;
}

export interface Runtime {
  info(): Promise<DockerInfo>;
  /** Shallow clone of one branch. Returns the commit that was checked out. */
  clone(
    repoUrl: string,
    branch: string,
    dir: string,
    log: LogLine,
  ): Promise<{ sha: string; message: string }>;
  build(dir: string, dockerfile: string, tag: string, log: LogLine): Promise<void>;
  pull(image: string, log: LogLine): Promise<void>;
  /** Starts a container for the app and returns its id. */
  run(options: RunOptions, log: LogLine): Promise<string>;
  isRunning(containerId: string): Promise<boolean>;
  containers(appId: string): Promise<AppContainer[]>;
  remove(containerId: string): Promise<void>;
  logs(containerId: string, tail: number): Promise<string>;
  action(containerId: string, action: AppAction): Promise<void>;
  /** Runs a command to completion in a throwaway container (release commands). */
  runOnce(options: ReleaseOptions, log: LogLine): Promise<void>;
  /** Pulls the image and starts a database container with its data in a named volume. */
  startDatabase(options: DatabaseRunOptions, log: LogLine): Promise<string>;
  databaseContainer(databaseId: string): Promise<AppContainer | null>;
  removeVolume(name: string): Promise<void>;
  /** CPU and memory of running Nocap containers. */
  stats(): Promise<ContainerStats[]>;
}

/** Turns "45.2MiB" or "1.1GB" into bytes. */
export function parseSize(text: string): number {
  const match = /^([\d.]+)\s*([kKMGT]?i?B)$/.exec(text.trim());
  if (!match) return 0;
  const units: Record<string, number> = {
    B: 1,
    kB: 1e3,
    KB: 1e3,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    TiB: 1024 ** 4,
  };
  return Math.round(Number(match[1]) * (units[match[2] ?? "B"] ?? 1));
}

/** Parses `docker stats --format "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"` output. */
export function parseStats(output: string): ContainerStats[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name = "", cpu = "", mem = ""] = line.split("\t");
      return {
        name,
        cpu: Number.parseFloat(cpu) || 0,
        memory: parseSize(mem.split("/")[0] ?? ""),
      };
    });
}

/** Only these reach `docker`, plus the variables meant for the container. */
function dockerEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DOCKER_HOST: process.env.DOCKER_HOST,
    ...extra,
  };
}

/** Short ids keep container and router names readable: nocap-1a2b3c4d. */
export const short = (id: string) => id.replaceAll("-", "").slice(0, 8);

/** Docker labels that make Traefik route the app's domains to it, with Let's Encrypt HTTPS. */
export function traefikLabels(options: RunOptions): Record<string, string> {
  if (options.domains.length === 0) return {};
  const router = `nocap-${short(options.appId)}`;
  const rule = options.domains.map((domain) => `Host(\`${domain}\`)`).join(" || ");
  return {
    "traefik.enable": "true",
    "traefik.docker.network": options.network,
    [`traefik.http.routers.${router}.rule`]: rule,
    [`traefik.http.routers.${router}.entrypoints`]: "websecure",
    [`traefik.http.routers.${router}.tls.certresolver`]: "letsencrypt",
    [`traefik.http.services.${router}.loadbalancer.server.port`]: String(options.port),
  };
}

/** Finds a program on PATH once, so the environment we pass to `docker run` cannot change it. */
function findBinary(name: string): string {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not in this folder.
    }
  }
  return name;
}

interface ExecOptions {
  log?: LogLine;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly output: string,
  ) {
    super(message);
  }
}

/** Runs a command without a shell. Streams its output to `log` and returns stdout. */
function exec(command: string, args: string[], options: ExecOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs ?? 30 * 60_000,
    });
    let stdout = "";
    let tail = "";
    const onData = (chunk: Buffer, isStdout: boolean) => {
      const text = chunk.toString("utf8");
      if (isStdout) stdout += text;
      tail = (tail + text).slice(-4000);
      if (options.log) for (const line of text.split(/\r?\n/)) if (line) options.log(line);
    };
    child.stdout.on("data", (chunk: Buffer) => onData(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => onData(chunk, false));
    child.on("error", (err) =>
      reject(new CommandError(`Could not run ${command}: ${err.message}`, tail)),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new CommandError(`${args[0] ?? command} failed (exit code ${code})`, tail));
    });
  });
}

export class DockerCliRuntime implements Runtime {
  private readonly docker = findBinary("docker");
  private readonly git = findBinary("git");

  private infoCache: { value: DockerInfo; expires: number } | null = null;

  async info(): Promise<DockerInfo> {
    // The dashboard refreshes every few seconds; ask Docker at most every 10 seconds.
    if (this.infoCache && this.infoCache.expires > Date.now()) return this.infoCache.value;
    const value = await this.readInfo();
    this.infoCache = { value, expires: Date.now() + 10_000 };
    return value;
  }

  private async readInfo(): Promise<DockerInfo> {
    try {
      const version = (
        await exec(this.docker, ["version", "--format", "{{.Server.Version}}"], {
          timeoutMs: 5000,
        })
      ).trim();
      const ids = await exec(this.docker, ["ps", "-q"], { timeoutMs: 5000 });
      return {
        available: true,
        version,
        containersRunning: ids.split("\n").filter(Boolean).length,
      };
    } catch {
      return { available: false, version: null, containersRunning: 0 };
    }
  }

  async clone(repoUrl: string, branch: string, dir: string, log: LogLine) {
    await exec(
      this.git,
      ["clone", "--depth", "1", "--single-branch", "--branch", branch, "--", repoUrl, dir],
      // Never ask for a password: private repositories arrive with Git providers (v0.0.3).
      { log, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeoutMs: 10 * 60_000 },
    );
    const sha = (await exec(this.git, ["-C", dir, "rev-parse", "HEAD"])).trim();
    const message = (await exec(this.git, ["-C", dir, "log", "-1", "--pretty=%s"])).trim();
    // .git/config holds the clone address, which can include a token. Remove it so it never ends
    // up in the image through `COPY . .`.
    await rm(join(dir, ".git"), { recursive: true, force: true });
    return { sha, message };
  }

  async build(dir: string, dockerfile: string, tag: string, log: LogLine) {
    await exec(
      this.docker,
      ["build", "--progress", "plain", "-f", join(dir, dockerfile), "-t", tag, dir],
      {
        log,
        env: { ...process.env, DOCKER_BUILDKIT: "1" },
      },
    );
  }

  async pull(image: string, log: LogLine) {
    await exec(this.docker, ["pull", image], { log, timeoutMs: 15 * 60_000 });
  }

  async run(options: RunOptions, log: LogLine): Promise<string> {
    const labels = {
      "nocap.app": options.appId,
      "nocap.deployment": options.deploymentId,
      ...traefikLabels(options),
    };
    const args = [
      "run",
      "--detach",
      "--name",
      `nocap-${short(options.appId)}-${short(options.deploymentId)}`,
      "--network",
      options.network,
      "--network-alias",
      `nocap-${short(options.appId)}`,
      "--restart",
      "unless-stopped",
    ];
    for (const [key, value] of Object.entries(labels)) args.push("--label", `${key}=${value}`);
    // `-e NAME` with no value copies NAME from the environment of the docker command itself,
    // so values never appear in the process list or in a file on disk.
    for (const key of Object.keys(options.env)) args.push("--env", key);
    args.push(options.image);

    const env = dockerEnv(options.env);
    const id = (await exec(this.docker, args, { log, env, timeoutMs: 120_000 })).trim();
    return id.slice(0, 12);
  }

  async isRunning(containerId: string) {
    try {
      const state = await exec(this.docker, ["inspect", "-f", "{{.State.Running}}", containerId]);
      return state.trim() === "true";
    } catch {
      return false;
    }
  }

  async containers(appId: string): Promise<AppContainer[]> {
    const output = await exec(this.docker, [
      "ps",
      "-a",
      "--filter",
      `label=nocap.app=${appId}`,
      "--format",
      '{{.ID}}\t{{.Label "nocap.deployment"}}\t{{.State}}',
    ]);
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id = "", deploymentId = "", state = ""] = line.split("\t");
        return { id, deploymentId, running: state === "running" };
      });
  }

  async remove(containerId: string) {
    await exec(this.docker, ["rm", "--force", containerId]);
  }

  async logs(containerId: string, tail: number) {
    // Container output goes to both streams; collect both in order.
    const lines: string[] = [];
    await exec(this.docker, ["logs", "--tail", String(tail), "--timestamps", containerId], {
      log: (line) => lines.push(line),
    });
    return lines.join("\n");
  }

  async action(containerId: string, action: AppAction) {
    await exec(this.docker, [action, containerId], { timeoutMs: 60_000 });
  }

  async runOnce(options: ReleaseOptions, log: LogLine) {
    const args = ["run", "--rm", "--name", options.name, "--network", options.network];
    args.push("--label", "nocap.release=true");
    for (const key of Object.keys(options.env)) args.push("--env", key);
    args.push("--entrypoint", "sh", options.image, "-c", options.command);
    try {
      await exec(this.docker, args, { log, env: dockerEnv(options.env), timeoutMs: 15 * 60_000 });
    } catch (err) {
      // On a timeout the docker command is killed but the container keeps going; stop it.
      await exec(this.docker, ["rm", "--force", options.name]).catch(() => undefined);
      throw err;
    }
  }

  async startDatabase(options: DatabaseRunOptions, log: LogLine) {
    await exec(this.docker, ["pull", options.image], { log, timeoutMs: 15 * 60_000 });
    const args = [
      "run",
      "--detach",
      "--name",
      options.name,
      "--network",
      options.network,
      "--network-alias",
      options.name,
      "--restart",
      "unless-stopped",
      "--label",
      `nocap.database=${options.databaseId}`,
      "--volume",
      `${options.volume}:${options.dataPath}`,
    ];
    for (const key of Object.keys(options.env)) args.push("--env", key);
    args.push(options.image, ...(options.command ?? []));
    const id = await exec(this.docker, args, {
      log,
      env: dockerEnv(options.env),
      timeoutMs: 120_000,
    });
    return id.trim().slice(0, 12);
  }

  async databaseContainer(databaseId: string): Promise<AppContainer | null> {
    const output = await exec(this.docker, [
      "ps",
      "-a",
      "--filter",
      `label=nocap.database=${databaseId}`,
      "--format",
      "{{.ID}}\t{{.State}}",
    ]);
    const [line] = output.split("\n").filter(Boolean);
    if (!line) return null;
    const [id = "", state = ""] = line.split("\t");
    return { id, deploymentId: "", running: state === "running" };
  }

  async removeVolume(name: string) {
    await exec(this.docker, ["volume", "rm", "--force", name]);
  }

  private statsCache: { value: Promise<ContainerStats[]>; expires: number } | null = null;

  stats(): Promise<ContainerStats[]> {
    // `docker stats` takes a second or two; every open panel tab shares one reading, and calls
    // that arrive while a reading is running wait for it instead of starting another.
    if (this.statsCache && this.statsCache.expires > Date.now()) return this.statsCache.value;
    const value = exec(
      this.docker,
      ["stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"],
      { timeoutMs: 15_000 },
    ).then((output) => parseStats(output).filter((s) => s.name.startsWith("nocap-")));
    this.statsCache = { value, expires: Date.now() + 10_000 };
    value.catch(() => {
      this.statsCache = null;
    });
    return value;
  }
}
