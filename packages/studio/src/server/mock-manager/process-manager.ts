import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";
import { allocatePort } from "./port-allocator";

const GRACEFUL_TIMEOUT = 3000;
const FORCE_TIMEOUT = 2000;

export interface ChildScenarioMeta {
  name: string;
  endpointCount: number;
  isActive: boolean;
  endpoints: Array<{
    group: string;
    endpoint: string;
    httpMethod: string;
    behavior: "resolves" | "returns" | "rejects" | "custom";
    latency?: number;
  }>;
}

/** IPC ready payload from child */
export interface ChildReadyData {
  port: number;
  url: string;
  routes: Array<Record<string, unknown>>;
  collections: Array<{ name: string; count: number; records: unknown[] }>;
  scenarios: ChildScenarioMeta[];
}

export interface SpawnedServer {
  child: ChildProcess;
  serverId: string;
  configPath: string;
  pid: number;
}

export interface ProcessManagerEvents {
  onReady: (serverId: string, data: ChildReadyData) => void;
  onError: (serverId: string, message: string, fatal: boolean) => void;
  onStopped: (serverId: string) => void;
  onCrashed: (serverId: string, code: number | null) => void;
  onEvent: (serverId: string, event: Record<string, unknown>) => void;
}

/** Resolves path to the bundled worker entry script via standard ESM resolution */
function resolveWorkerPath(): string {
  const resolved = import.meta.resolve("@noverax/nexus-mock/managed/worker-entry");
  return resolved.startsWith("file://") ? resolved.slice(7) : resolved;
}

export function createProcessManager(events: ProcessManagerEvents) {
  const children = new Map<string, ChildProcess>();

  async function spawn(
    serverId: string,
    configPath: string,
    preferredPort: number,
  ): Promise<SpawnedServer> {
    const port = preferredPort > 0 ? await allocatePort(preferredPort) : 0;
    const workerPath = resolveWorkerPath();

    const child = fork(workerPath, [], {
      execArgv: ["--import", "tsx/esm"],
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    children.set(serverId, child);

    child.on("message", (raw: unknown) => {
      const msg = raw as Record<string, unknown>;
      switch (msg.type) {
        case "ready":
          events.onReady(serverId, msg as unknown as ChildReadyData);
          break;
        case "error":
          events.onError(serverId, msg.message as string, msg.fatal as boolean);
          break;
        case "stopped":
          events.onStopped(serverId);
          break;
        case "event":
          events.onEvent(serverId, msg.event as Record<string, unknown>);
          break;
      }
    });

    child.on("exit", (code) => {
      children.delete(serverId);
      if (code !== 0 && code !== null) {
        events.onCrashed(serverId, code);
      }
    });

    child.send({ type: "start", configPath, port });

    return { child, serverId, configPath, pid: child.pid ?? 0 };
  }

  async function kill(serverId: string): Promise<void> {
    const child = children.get(serverId);
    if (!child) return;

    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        children.delete(serverId);
        resolve();
      };

      child.once("exit", done);
      child.send({ type: "stop" });

      setTimeout(() => {
        if (resolved) return;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (resolved) return;
          child.kill("SIGKILL");
          done();
        }, FORCE_TIMEOUT);
      }, GRACEFUL_TIMEOUT);
    });
  }

  async function killAll(): Promise<void> {
    await Promise.all([...children.keys()].map(kill));
  }

  function killAllSync(): void {
    for (const child of children.values()) {
      child.kill("SIGKILL");
    }
    children.clear();
  }

  function has(serverId: string): boolean {
    return children.has(serverId);
  }

  // Ensure children die with parent
  process.on("exit", killAllSync);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      killAll().then(() => process.exit(0));
    });
  }

  /** Send a store command to a managed child process via IPC */
  function sendCommand(serverId: string, command: Record<string, unknown>): void {
    const child = children.get(serverId);
    if (!child?.connected) return;
    child.send({ type: "command", command, requestId: `cmd_${Date.now().toString(36)}` });
  }

  return { spawn, kill, killAll, killAllSync, has, sendCommand };
}

export type ProcessManager = ReturnType<typeof createProcessManager>;
