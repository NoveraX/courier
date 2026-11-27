/**
 * A Courier server in a process of its own, for a test that runs as an app
 * on another platform: what that platform's globals put in place of Node's
 * reaches the app alone, as it would. See `tests/fixtures/app-server.ts`.
 */
import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { WSHandlerStats } from "../../src/adapter/ws-handler-stats";
import type { AppServerCommand, AppServerEvent, AppServerRequest } from "../fixtures/app-server";

/** The server, as the test drives it and reads what it saw. */
export interface AppServer {
  /** Its origin, over `ws:`: it serves the room on every path */
  readonly url: string;
  /** The headers each connection opened with, in order, as the server read them */
  readonly opened: ReadonlyArray<Readonly<Record<string, string>>>;
  /** The code each connection ended with, as the server saw it */
  readonly ended: readonly number[];
  /** Send `payload` to every subscriber of the room, kept for one that comes back */
  broadcast(payload: string): Promise<void>;
  /** Its handler's stats: its connections, and what carries them over HTTP */
  stats(): Promise<WSHandlerStats>;
  /** Close its connections and end its process */
  stop(): Promise<void>;
}

/**
 * Start the server, and wait until it listens.
 *
 * @param options - `refuseUpgrades` answers every upgrade 403, as a proxy that lets no WebSocket
 *   through; `heartbeatMs` is how often each connection is pinged, and how long its pong may take;
 *   `allowedOrigins`, the pages the server admits besides its own
 * @returns The server
 * @example
 * ```ts
 * const server = await serveApp();
 * await server.broadcast("hello");
 * await server.stop();
 * ```
 */
export async function serveApp(
  options: {
    readonly refuseUpgrades?: boolean;
    readonly heartbeatMs?: number;
    readonly allowedOrigins?: readonly string[];
  } = {},
): Promise<AppServer> {
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const args = [
    ...(options.refuseUpgrades ? ["--refuse-upgrades"] : []),
    ...(options.heartbeatMs === undefined ? [] : [`--heartbeat=${options.heartbeatMs}`]),
    ...(options.allowedOrigins === undefined
      ? []
      : [`--allowed-origins=${options.allowedOrigins.join(",")}`]),
  ];
  const child = fork(join(__dirname, "../fixtures/app-server.ts"), args, {
    execArgv: ["--import", tsx],
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let said = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    said += chunk.toString();
  });
  const opened: Array<Record<string, string>> = [];
  const ended: number[] = [];
  const waiting = new Map<number, (answer: unknown) => void>();
  let next = 0;
  const url = await new Promise<string>((resolve, reject) => {
    child.on(
      "message",
      (message: AppServerEvent | { readonly id: number; readonly answer?: unknown }) => {
        if ("id" in message) waiting.get(message.id)?.(message.answer);
        else if (message.event === "listening") resolve(message.url);
        else if (message.event === "opened") opened.push(message.headers);
        else ended.push(message.code);
      },
    );
    child.once("exit", (code) => reject(new Error(`The server exited with ${code}: ${said}`)));
  });
  const ask = (command: AppServerRequest): Promise<unknown> =>
    new Promise((resolve) => {
      const id = ++next;
      waiting.set(id, (answer) => {
        waiting.delete(id);
        resolve(answer);
      });
      const sent: AppServerCommand = { ...command, id };
      child.send(sent);
    });
  return {
    url,
    opened,
    ended,
    broadcast: async (payload) => {
      await ask({ op: "broadcast", payload });
    },
    stats: async () => (await ask({ op: "stats" })) as WSHandlerStats,
    stop: async () => {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      await ask({ op: "stop" });
      await exited;
    },
  };
}
