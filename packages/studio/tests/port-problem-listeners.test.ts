/**
 * A port another process listens on reads as in use, whichever address it
 * listens on: either loopback, or every address — `::`, where a plain
 * `listen(port)` binds, and `0.0.0.0`. On macOS a bind to the loopback
 * succeeds beside a listener on every address, which http://localhost:PORT
 * then reaches instead of the mock.
 */
import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { portProblem } from "../src/server/mock-manager/port-problem";

const held: Server[] = [];

afterEach(async () => {
  await Promise.all(held.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

const ipv6 = await new Promise<boolean>((resolve) => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen({ port: 0, host: "::1", ipv6Only: true }, () => probe.close(() => resolve(true)));
});

/* Linux refuses to bind 127.0.0.1 beside a listener on 0.0.0.0, so there the
   bind finds such a listener and portProblem never connects to it. */
const bindsBesideWildcard = await new Promise<boolean>((resolve) => {
  const wildcard = createServer();
  wildcard.listen({ port: 0, host: "0.0.0.0" }, () => {
    const address = wildcard.address();
    const port = address !== null && typeof address !== "string" ? address.port : 0;
    const loopback = createServer();
    loopback.once("error", () => wildcard.close(() => resolve(false)));
    loopback.listen({ port, host: "127.0.0.1" }, () =>
      loopback.close(() => wildcard.close(() => resolve(true))),
    );
  });
});

async function holdOn(host: string): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen({ port: 0, host, ipv6Only: host === "::1" }, resolve));
  held.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("The holder has no port.");
  return address.port;
}

describe("portProblem with another listener on the port", () => {
  it.each(["127.0.0.1", "0.0.0.0"])("says a port held on %s is in use", async (host) => {
    const port = await holdOn(host);

    expect(await portProblem(port)).toBe("in use");
  });

  it.skipIf(!ipv6).each(["::1", "::"])("says a port held on %s is in use", async (host) => {
    const port = await holdOn(host);

    expect(await portProblem(port)).toBe("in use");
  });

  it.skipIf(!bindsBesideWildcard)(
    "ends its connection to a server that greets its clients without resetting it",
    async () => {
      const errors: string[] = [];
      let closed: () => void = () => undefined;
      const clientClosed = new Promise<void>((resolve) => {
        closed = resolve;
      });
      const server = createServer((client) => {
        client.on("error", (err: NodeJS.ErrnoException) => errors.push(err.code ?? err.message));
        client.on("close", closed);
        client.end("hello\n");
      });
      await new Promise<void>((resolve) => server.listen({ port: 0, host: "0.0.0.0" }, resolve));
      held.push(server);
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("The holder has no port.");

      expect(await portProblem(address.port)).toBe("in use");
      await clientClosed;
      expect(errors).toEqual([]);
    },
  );

  it("finds nothing wrong once the listener is gone", async () => {
    const port = await holdOn("0.0.0.0");
    await new Promise((resolve) => held.pop()?.close(resolve));

    expect(await portProblem(port)).toBeNull();
  });
});
