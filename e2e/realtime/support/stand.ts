/**
 * A stand for the realtime checks: one Courier replica with its HTTP
 * transport, numbering an event on the room every 50 ms into a log its
 * connections resume from; the entry in front of it, which every request of
 * the page's passes; and the page, served from an origin of its own, as an
 * application's often is. The entry lets a WebSocket through, refuses its
 * upgrade as a proxy that takes none does, or refuses it and holds every
 * answer back until it ends, as a proxy that reads a whole response before
 * it sends any of it.
 */
import {
  createServer,
  type IncomingMessage,
  request,
  type Server,
  type ServerResponse,
} from "node:http";
import { type AddressInfo, connect } from "node:net";
import { basename, join } from "node:path";
import type { Duplex } from "node:stream";

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { attachWebSocketUpgrade } from "@noverax/courier/node";
import { createMemoryBus } from "@noverax/courier/realtime";
import { type ConnectionRegistry, createWSHandler } from "@noverax/courier/server";
import { build } from "esbuild";
import { WebSocketServer } from "ws";

import { REPO } from "../../support/project";
import { ADMITTED, ROOM, type Said } from "./terms";

/** What the entry does with a page's WebSocket. */
export type EntryMode =
  /** Lets it through, and every answer as it comes */
  | "pass"
  /** Refuses its upgrade with 403, as a proxy that takes no WebSocket; every answer as it comes */
  | "refuse"
  /** Refuses its upgrade, and holds every answer back until it ends, then sends it whole */
  | "hold";

/** The stand a check drives. */
export interface Stand {
  /** The page to open */
  readonly page: string;
  /** The socket's address at the entry, where the page's connections go */
  readonly url: string;
  /** Change what the entry does with a WebSocket from now on */
  setMode(mode: EntryMode): void;
  /** How many upgrades the entry has been asked for */
  upgrades(): number;
  /** The replica's connections */
  readonly connections: ConnectionRegistry;
  /** The user of each connection the replica took credentials of again, in turn */
  readonly reauths: readonly string[];
  /** Stop the page, the entry and the replica */
  stop(): Promise<void>;
}

/* The packages as an application has them, built: the root's paths point them at their sources. */
const BUILT = join(REPO, "tsconfig.base.json");

/**
 * Start the page, the replica and the entry in front of it.
 *
 * @param mode - What the entry does with a WebSocket to begin with
 * @returns The stand
 * @example
 * ```ts
 * const stand = await startStand("refuse");
 * await page.goto(stand.page);
 * ```
 */
export async function startStand(mode: EntryMode): Promise<Stand> {
  const page = await servePage();
  const replica = await startReplica(page.origin);
  let now = mode;
  let upgrades = 0;
  const entry = await startEntry(
    replica.port,
    () => now,
    () => {
      upgrades += 1;
    },
  );
  return {
    page: page.origin,
    url: `ws://127.0.0.1:${entry.port}/ws`,
    setMode: (next) => {
      now = next;
    },
    upgrades: () => upgrades,
    connections: replica.connections,
    reauths: replica.reauths,
    async stop() {
      await entry.stop();
      await replica.stop();
      await closed(page.server);
    },
  };
}

/* The page and its script, bundled for the browser with each chunk the script loads when it needs it. */
async function servePage(): Promise<{ readonly origin: string; readonly server: Server }> {
  const built = await build({
    entryPoints: [join(import.meta.dirname, "page.ts")],
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    tsconfig: BUILT,
    /* Only named: nothing is written. */
    outdir: join(import.meta.dirname, "bundle"),
    write: false,
    logLevel: "silent",
  });
  const scripts = new Map(built.outputFiles.map((file) => [`/${basename(file.path)}`, file.text]));
  const html =
    '<!doctype html><meta charset="utf-8"><title>Realtime</title><script type="module" src="/page.js"></script>';
  const server = createServer((req, res) => {
    const script = scripts.get(req.url ?? "");
    if (script !== undefined) {
      res.writeHead(200, { "content-type": "text/javascript" }).end(script);
      return;
    }
    if (req.url === "/") res.writeHead(200, { "content-type": "text/html" }).end(html);
    else res.writeHead(404).end();
  });
  return { origin: `http://127.0.0.1:${await listen(server)}`, server };
}

/* One replica, its HTTP transport answering ahead of the server's own handler, as an application wires it. */
async function startReplica(origin: string) {
  const { channel } = courier();
  const room = channel
    .send<string>()
    .response<Said>()
    .implement(() => ({
      onJoin: (ctx) => ctx.send({ snapshot: true }),
      onMessage: (ctx, message) => ctx.send({ echo: message }),
    }));
  const api = defineApi({
    name: "api",
    baseURL: "http://upstream.invalid",
    expose: true,
    groups: { live: defineGroup({ prefix: "live", endpoints: { room } }) },
  });
  const reauths: string[] = [];
  const admit = (auth: Readonly<Record<string, unknown>> | undefined) => {
    if (auth?.token !== ADMITTED || typeof auth.userId !== "string")
      throw new Error("Unauthorized");
    return { userId: auth.userId };
  };
  const handler = createWSHandler({
    sources: { api },
    pubsub: createMemoryBus({ log: {} }).replica("stand"),
    allowedOrigins: [origin],
    maxConnectionsPerKey: {
      key: ({ userId }) => (typeof userId === "string" ? userId : undefined),
      max: 1,
    },
    onConnect: ({ auth }) => admit(auth),
    onReauth: ({ auth }) => {
      const meta = admit(auth);
      reauths.push(meta.userId);
      return meta;
    },
  });
  const server = createServer((_req, res) => void res.writeHead(404).end());
  const detach = attachWebSocketUpgrade(server, {
    path: "/ws",
    createServer: (options) => new WebSocketServer(options),
    onSocket: (socket, request) => handler.handleSocket(socket, request),
    httpTransport: handler,
  });
  const port = await listen(server);
  let n = 0;
  const publishing = setInterval(() => {
    n += 1;
    void handler.connections.broadcastToTopic(ROOM, { n });
  }, 50);
  async function stop(): Promise<void> {
    clearInterval(publishing);
    await handler.destroy({ timeoutMs: 500 });
    detach();
    server.closeAllConnections();
    await closed(server);
  }
  return { port, connections: handler.connections, reauths, stop };
}

/* The entry: every request passed to the replica, an upgrade as `mode` says, each counted. */
async function startEntry(replica: number, mode: () => EntryMode, upgraded: () => void) {
  const tunnels = new Set<Duplex>();
  const server = createServer((req, res) => pass(req, res, replica, mode() === "hold"));
  server.on("upgrade", (req: IncomingMessage, client: Duplex, head: Buffer) => {
    upgraded();
    client.on("error", () => undefined);
    if (mode() !== "pass") {
      client.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
      return;
    }
    tunnels.add(client);
    client.on("close", () => tunnels.delete(client));
    tunnel(req, client, head, replica);
  });
  const port = await listen(server);
  async function stop(): Promise<void> {
    for (const client of tunnels) client.destroy();
    server.closeAllConnections();
    await closed(server);
  }
  return { port, stop };
}

/* A request passed to the replica, and its answer back: as it comes, or held until it ends. */
function pass(req: IncomingMessage, res: ServerResponse, replica: number, hold: boolean): void {
  const forward = {
    host: "127.0.0.1",
    port: replica,
    method: req.method,
    path: req.url,
    headers: req.headers,
  };
  const way = request(forward, (answer) => {
    const status = answer.statusCode ?? 502;
    if (!hold) {
      res.writeHead(status, answer.headers);
      answer.pipe(res);
      return;
    }
    const chunks: Buffer[] = [];
    answer.on("data", (chunk: Buffer) => chunks.push(chunk));
    answer.on("end", () => {
      const body = Buffer.concat(chunks);
      const { "transfer-encoding": _chunked, ...headers } = answer.headers;
      res.writeHead(status, { ...headers, "content-length": body.byteLength }).end(body);
    });
  });
  way.on("error", () => res.destroy());
  res.on("close", () => way.destroy());
  req.pipe(way);
}

/* An upgrade passed to the replica byte for byte, its request as it came. */
function tunnel(req: IncomingMessage, client: Duplex, head: Buffer, replica: number): void {
  const way = connect(replica, "127.0.0.1", () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    way.write(`${lines.join("\r\n")}\r\n\r\n`);
    way.write(head);
    client.pipe(way).pipe(client);
  });
  way.on("error", () => client.destroy());
  way.on("close", () => client.destroy());
  client.on("close", () => way.destroy());
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });
}

function closed(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
