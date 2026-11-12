import type { AppAction, DockerInfo } from "@nocap/shared";
import {
  CommandError,
  short,
  type AppContainer,
  type ContainerStats,
  type DatabaseRunOptions,
  type LogLine,
  type ReleaseOptions,
  type RunOptions,
  type Runtime,
} from "../src/runtime";

/** A Runtime that keeps containers in memory, so tests need neither Docker nor Git. */
export class FakeRuntime implements Runtime {
  readonly calls: string[] = [];
  readonly runs: RunOptions[] = [];
  readonly containerList: (AppContainer & { appId: string })[] = [];
  /** Make the next build fail. */
  failBuild = false;
  /** Make the next started container die right away. */
  crashOnStart = false;
  private next = 1;

  async info(): Promise<DockerInfo> {
    return {
      available: true,
      version: "fake",
      containersRunning: this.containerList.filter((c) => c.running).length,
    };
  }

  async clone(repoUrl: string, branch: string, _dir: string, log: LogLine) {
    this.calls.push(`clone ${repoUrl} ${branch}`);
    log("Cloning into 'app'...");
    return { sha: "0123456789abcdef0123456789abcdef01234567", message: "Add health check" };
  }

  async build(_dir: string, dockerfile: string, tag: string, log: LogLine) {
    this.calls.push(`build ${dockerfile} ${tag}`);
    log("#1 [internal] load build definition");
    if (this.failBuild) {
      this.failBuild = false;
      throw new CommandError("build failed (exit code 1)", "npm ERR! missing script: build");
    }
  }

  async pull(image: string, log: LogLine) {
    this.calls.push(`pull ${image}`);
    log(`${image}: Pulling from library`);
  }

  async run(options: RunOptions, log: LogLine) {
    this.runs.push(options);
    const id = `c${String(this.next++).padStart(11, "0")}`;
    this.containerList.push({
      id,
      appId: options.appId,
      deploymentId: options.deploymentId,
      running: !this.crashOnStart,
    });
    this.crashOnStart = false;
    log(id);
    return id;
  }

  async isRunning(containerId: string) {
    return this.containerList.find((c) => c.id === containerId)?.running ?? false;
  }

  async containers(appId: string) {
    return this.containerList
      .filter((c) => c.appId === appId)
      .map(({ id, deploymentId, running }) => ({ id, deploymentId, running }));
  }

  async remove(containerId: string) {
    this.calls.push(`remove ${containerId}`);
    const index = this.containerList.findIndex((c) => c.id === containerId);
    if (index >= 0) this.containerList.splice(index, 1);
    const dbIndex = this.databaseList.findIndex((c) => c.id === containerId);
    if (dbIndex >= 0) this.databaseList.splice(dbIndex, 1);
  }

  async logs(containerId: string) {
    return `${containerId} listening on port 3000`;
  }

  async action(containerId: string, action: AppAction) {
    this.calls.push(`${action} ${containerId}`);
    const container =
      this.containerList.find((c) => c.id === containerId) ??
      this.databaseList.find((c) => c.id === containerId);
    if (container) container.running = action !== "stop";
  }

  readonly releases: ReleaseOptions[] = [];
  /** Make the next release command fail. */
  failRelease = false;

  async runOnce(options: ReleaseOptions, log: LogLine) {
    this.releases.push(options);
    log(`$ ${options.command}`);
    if (this.failRelease) {
      this.failRelease = false;
      throw new CommandError("run failed (exit code 1)", "migration failed");
    }
    log("All migrations have been applied");
  }

  readonly databaseList: (AppContainer & { databaseId: string; options: DatabaseRunOptions })[] =
    [];
  readonly volumes = new Set<string>();
  /** Make the next database fail to start. */
  failDatabase = false;

  async startDatabase(options: DatabaseRunOptions, log: LogLine) {
    this.calls.push(`pull ${options.image}`);
    if (this.failDatabase) {
      this.failDatabase = false;
      log("Error response from daemon: manifest unknown");
      throw new CommandError("pull failed (exit code 1)", "manifest unknown");
    }
    const id = `d${String(this.next++).padStart(11, "0")}`;
    this.volumes.add(options.volume);
    this.databaseList.push({
      id,
      deploymentId: "",
      databaseId: options.databaseId,
      running: true,
      options,
    });
    return id;
  }

  async databaseContainer(databaseId: string) {
    const found = this.databaseList.find((c) => c.databaseId === databaseId);
    return found ? { id: found.id, deploymentId: "", running: found.running } : null;
  }

  async removeVolume(name: string) {
    this.calls.push(`volume rm ${name}`);
    this.volumes.delete(name);
  }

  async stats(): Promise<ContainerStats[]> {
    return [
      ...this.containerList
        .filter((c) => c.running)
        .map((c) => ({
          name: `nocap-${short(c.appId)}-${short(c.deploymentId)}`,
          cpu: 2.5,
          memory: 128 * 1024 * 1024,
        })),
      ...this.databaseList.map((c) => ({
        name: c.options.name,
        cpu: 1.5,
        memory: 64 * 1024 * 1024,
      })),
    ];
  }
}
