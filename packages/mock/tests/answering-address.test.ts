/**
 * Where something already accepts connections on a port: a listener is found
 * however long the process was busy after the probe started, a free port is
 * not, and the probe closes what it connected without resetting the other
 * process's side.
 */
import { createServer, type Server, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";

import { answeringAddress } from "../src/server/answering-address";

/* Longer than the probe's timeout, so the timeout is due before the probe's
   socket is polled again. */
const STALL_MS = 700;

const held: Server[] = [];

afterEach(async () => {
  await Promise.all(
    held.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

/* Keeps the event loop busy, as a long synchronous task in the process does. */
function stall(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* nothing but waiting */
  }
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, resolve));
  held.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("The server has no port.");
  return address.port;
}

function nextConnection(server: Server): Promise<Socket> {
  return new Promise((resolve) => server.once("connection", resolve));
}

function closeOf(socket: Socket): Promise<void> {
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

describe("answeringAddress", () => {
  it("finds a listener though the process stalls right after the probe starts", async () => {
    const port = await listen(createServer());

    const answering = answeringAddress(port, ["127.0.0.1"]);
    stall(STALL_MS);

    expect(await answering).toBe("127.0.0.1");
  });

  it("finds nothing on a free port though the process stalls", async () => {
    const port = await listen(createServer());
    await new Promise((resolve) => held.pop()?.close(resolve));

    const answering = answeringAddress(port, ["127.0.0.1"]);
    stall(STALL_MS);

    expect(await answering).toBeNull();
  });

  it("ends a connection accepted during a stall without resetting a server that greets", async () => {
    const errors: string[] = [];
    const server = createServer((client) => {
      client.on("error", (err: NodeJS.ErrnoException) => errors.push(err.code ?? err.message));
      client.end("hello\n");
    });
    const port = await listen(server);
    const accepted = nextConnection(server);

    const answering = answeringAddress(port, ["127.0.0.1"]);
    stall(STALL_MS);

    expect(await answering).toBe("127.0.0.1");
    await closeOf(await accepted);
    expect(errors).toEqual([]);
  });

  it("closes a connection the other process keeps open once it idles", async () => {
    const server = createServer({ allowHalfOpen: true });
    const port = await listen(server);
    const accepted = nextConnection(server);

    expect(await answeringAddress(port, ["127.0.0.1"])).toBe("127.0.0.1");
    const client = await accepted;
    const errors: string[] = [];
    client.on("error", (err: NodeJS.ErrnoException) => errors.push(err.code ?? err.message));
    const closed = closeOf(client).then(() => "closed");
    await delay(1000);
    /* A probe that closed its socket answers data with a reset, which ends
       this side too; a probe still open reads the data and drops it. */
    client.write("late\n");
    await delay(50);
    client.write("late\n");

    try {
      expect(await Promise.race([closed, delay(1000, "open")])).toBe("closed");
      expect(errors).toEqual([expect.stringMatching(/^(EPIPE|ECONNRESET)$/)]);
    } finally {
      client.destroy();
    }
  });
});
