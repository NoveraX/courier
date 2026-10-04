import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createLogger } from "@noverax/courier";
import type { ChildMessage, ParentMessage } from "@noverax/courier-mock/managed";
import type { CommandReplies, CommandReply } from "./command-replies";
import { createCommandReplies } from "./command-replies";
import { stopWorker } from "./stop-worker";
import type { ProcessManager, SpawnRequest } from "./types";

const log = createLogger("Mock");

const GONE = "The mock is not running.";

/**
 * Studio's own mock worker, found through the package itself, so the path is
 * the same from source and from the published lib and holds in any project
 * path.
 */
const WORKER = join(
  dirname(createRequire(import.meta.url).resolve("@noverax/courier-studio/package.json")),
  "lib",
  "mock-worker.js",
);

/** What a mock server reports once it listens. */
export type ChildReadyData = Omit<Extract<ChildMessage, { type: "ready" }>, "type">;

export interface ProcessManagerEvents {
  onReady: (serverId: string, data: ChildReadyData) => void;
  onError: (serverId: string, message: string, fatal: boolean) => void;
  onStopped: (serverId: string) => void;
  /** The process ended without Studio asking it to — a crash, a signal, or an exit of its own. */
  onExited: (serverId: string, reason: string) => void;
  onEvent: (serverId: string, event: Record<string, unknown>) => void;
}

/** What every worker is told, whichever mock it serves. */
export interface ProcessManagerOptions {
  /**
   * Where Studio keeps the transforms of the project's modules at the moment
   * a worker starts, or `null` when it keeps none. The worker reads that
   * directory rather than looking one up from its mocks file, which may be a
   * link into another package with a `node_modules` of its own.
   */
  transformCacheDirectory: () => string | null;
  /**
   * The file a mock's worker keeps its store in, so its records outlive the
   * worker; `null` when Studio keeps none for it.
   */
  storeFile: (mockKey: string) => string | null;
}

/**
 * Start, stop and message the worker processes of Studio's managed mocks.
 *
 * Each worker is Studio's own entry, forked from the mocks file's directory
 * with the output in Studio's terminal. Its start message names the mock, the
 * port Studio chose, where Studio keeps transforms at that moment, so the
 * worker reuses them instead of transforming the project's modules again,
 * and the file the worker keeps the mock's store in.
 *
 * @param events - What Studio does with what a worker reports
 * @param options - What every worker is told; see {@link ProcessManagerOptions}
 * @returns The operations on the workers, by mock; see {@link ProcessManager}
 * @example
 * ```ts
 * const processManager = createProcessManager(events, {
 *   transformCacheDirectory: () => findTransformCacheDirectory(projectRoot),
 *   storeFile: (mockKey) => mockStoreFile(projectRoot, mockKey),
 * });
 * processManager.spawn({ serverId: "apiMock", mocksFile, mockKey: "apiMock", port: 7001 });
 * ```
 */
export function createProcessManager(
  events: ProcessManagerEvents,
  { transformCacheDirectory, storeFile }: ProcessManagerOptions,
): ProcessManager {
  const children = new Map<string, ChildProcess>();
  /** Workers Studio asked to stop; their exit is expected. */
  const stopping = new WeakSet<ChildProcess>();
  const commands = new WeakMap<ChildProcess, CommandReplies>();

  function route(serverId: string, child: ChildProcess, msg: ChildMessage): void {
    if (msg.type === "ready") events.onReady(serverId, msg);
    else if (msg.type === "error") events.onError(serverId, msg.message, msg.fatal);
    else if (msg.type === "stopped") events.onStopped(serverId);
    else if (msg.type === "event") events.onEvent(serverId, msg.event);
    else if (msg.type === "command-result") commands.get(child)?.settle(msg);
  }

  function send(serverId: string, child: ChildProcess, msg: ParentMessage): void {
    if (!child.connected) return;
    child.send(msg, (err) => {
      if (err) log.debug(`Could not reach the worker of ${serverId}`, err);
    });
  }

  function spawn({ serverId, mocksFile, mockKey, port }: SpawnRequest): { pid: number } {
    /* Output is inherited, so request logs and crash stacks reach Studio's
       terminal, and no unread pipe can fill up and stall the worker. */
    const child = fork(WORKER, [], {
      cwd: dirname(mocksFile),
      execArgv: [],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    children.set(serverId, child);
    commands.set(child, createCommandReplies());

    child.on("message", (msg: ChildMessage) => route(serverId, child, msg));
    child.on("error", (err) => events.onError(serverId, err.message, true));
    /* `close`, not `exit`: it follows the last IPC message, so an error the
       worker reported before dying is handled before its death is. */
    child.on("close", (code, signal) => {
      commands.get(child)?.failAll("The mock stopped before it answered.");
      const current = children.get(serverId) === child;
      if (current) children.delete(serverId);
      if (!current || stopping.has(child)) return;
      events.onExited(serverId, signal ? `was stopped by ${signal}` : `exited with code ${code}`);
    });

    send(serverId, child, {
      type: "start",
      mocksFile,
      mockKey,
      port,
      transformCacheDirectory: transformCacheDirectory(),
      storeFile: storeFile(mockKey),
    });
    return { pid: child.pid ?? 0 };
  }

  async function kill(serverId: string): Promise<void> {
    const child = children.get(serverId);
    if (!child) return;
    stopping.add(child);
    await stopWorker(child, () => send(serverId, child, { type: "stop" }));
    if (children.get(serverId) === child) children.delete(serverId);
  }

  function killAllSync(): void {
    for (const child of children.values()) child.kill("SIGKILL");
    children.clear();
  }

  /* A last resort for a host that exits without closing Studio; removed on
     close, so servers created one after another do not pile them up. */
  process.on("exit", killAllSync);

  async function dispose(): Promise<void> {
    await Promise.all([...children.keys()].map(kill));
    process.off("exit", killAllSync);
  }

  function has(serverId: string): boolean {
    return children.has(serverId);
  }

  function sendCommand(serverId: string, command: Record<string, unknown>): Promise<CommandReply> {
    const child = children.get(serverId);
    const replies = child && commands.get(child);
    if (!child?.connected || !replies) return Promise.resolve({ ok: false, error: GONE });
    const { requestId, reply } = replies.expect();
    send(serverId, child, { type: "command", command, requestId });
    return reply;
  }

  return { spawn, kill, dispose, has, sendCommand };
}
