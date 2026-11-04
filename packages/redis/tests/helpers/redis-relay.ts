import { createConnection, createServer, type Socket } from "node:net";

/**
 * What the relay does with a connection.
 * - `up`: carries it to Redis;
 * - `down`: accepts and ends it at once, as a Redis that is not there leaves a client with nothing;
 * - `silent`: accepts and holds it without a byte back, as a Redis that hangs.
 */
export type RelayMode = "up" | "down" | "silent";

/** A TCP relay in front of the test's Redis, standing for what can happen to it. */
export interface RedisRelay {
  readonly port: number;
  /** Change what new connections meet; the ones it carries are left as they are */
  set(mode: RelayMode): void;
  /** End every connection it carries or holds, as a restart of Redis does */
  cut(): void;
  close(): Promise<void>;
}

/**
 * Start a relay to Redis at `target`. It keeps its listening socket all
 * through the test — a port let go of could be taken by another process
 * before it is listened on again — and stands for an outage by what it
 * does with each connection instead.
 *
 * @param target - The address of the test's Redis
 * @returns The relay, carrying connections
 * @example
 * ```ts
 * const relay = await startRelay(new URL(REDIS_URL));
 * relay.set("down");
 * relay.cut();
 * ```
 */
export async function startRelay(target: URL): Promise<RedisRelay> {
  const open = new Set<Socket>();
  let mode: RelayMode = "up";
  const keep = (socket: Socket): void => {
    open.add(socket);
    socket.on("close", () => open.delete(socket));
    socket.on("error", () => undefined);
  };
  const server = createServer((client) => {
    keep(client);
    if (mode === "down") {
      client.destroy();
      return;
    }
    if (mode === "silent") return;
    const upstream = createConnection({ port: Number(target.port || 6379), host: target.hostname });
    keep(upstream);
    client.pipe(upstream).pipe(client);
    client.on("close", () => upstream.destroy());
    upstream.on("close", () => client.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the relay has no port");
  const cut = (): void => {
    for (const socket of open) socket.destroy();
  };
  return {
    port: address.port,
    set: (next) => {
      mode = next;
    },
    cut,
    close: async () => {
      cut();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
