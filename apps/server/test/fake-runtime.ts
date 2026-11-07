import type { AppAction, DockerInfo } from "@nocap/shared";
import {
  CommandError,
  type AppContainer,
  type LogLine,
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
  }

  async logs(containerId: string) {
    return `${containerId} listening on port 3000`;
  }

  async action(containerId: string, action: AppAction) {
    this.calls.push(`${action} ${containerId}`);
    const container = this.containerList.find((c) => c.id === containerId);
    if (container) container.running = action !== "stop";
  }
}
