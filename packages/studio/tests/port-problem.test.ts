/**
 * Why a mock could not listen on a port: another process holds it, or the
 * process may not bind it — told apart, since only the first ever frees up.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const outcome = vi.hoisted(() => ({ codes: new Map<string, string | null>() }));

vi.mock("node:net", () => ({
  createServer: () => {
    const server = new EventEmitter() as EventEmitter & {
      listen(options: { host: string }): void;
      close(done: () => void): void;
    };
    server.listen = ({ host }) => {
      const code = outcome.codes.get(host) ?? null;
      queueMicrotask(() =>
        code ? server.emit("error", Object.assign(new Error(code), { code })) : server.emit("listening"),
      );
    };
    server.close = (done) => done();
    return server;
  },
}));

const { portProblem } = await import("../src/server/mock-manager/port-problem");

afterEach(() => {
  outcome.codes.clear();
});

describe("portProblem", () => {
  it("finds nothing wrong with a port both loopbacks let it bind", async () => {
    expect(await portProblem(7001)).toBeNull();
  });

  it("says a port another process holds is in use", async () => {
    outcome.codes.set("127.0.0.1", "EADDRINUSE");

    expect(await portProblem(7001)).toBe("in use");
  });

  it("says a port the process may not bind is not permitted", async () => {
    outcome.codes.set("127.0.0.1", "EACCES");

    expect(await portProblem(80)).toBe("not permitted");
  });

  it("does not count a system without IPv6 against the port", async () => {
    outcome.codes.set("::1", "EADDRNOTAVAIL");

    expect(await portProblem(7001)).toBeNull();
  });

  it("says a port held on the IPv6 loopback only is in use", async () => {
    outcome.codes.set("::1", "EADDRINUSE");

    expect(await portProblem(7001)).toBe("in use");
  });
});
