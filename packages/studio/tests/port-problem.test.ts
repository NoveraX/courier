/**
 * Why a mock could not listen on a port: another process holds it, or the
 * process may not bind it — told apart, since only the first ever frees up.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

/* How a probe of the loopback ends: accepted, unanswered until its timeout,
   or accepted a moment after its timeout ran, as after the process was busy. */
type Answer = "connect" | "timeout" | "connect after timeout";

const outcome = vi.hoisted(() => ({
  codes: new Map<string, string | null>(),
  answers: new Map<string, Answer>(),
}));

vi.mock("node:net", () => ({
  createServer: () => {
    const server = new EventEmitter() as EventEmitter & {
      listen(options: { host: string }): void;
      close(done: () => void): void;
    };
    server.listen = ({ host }) => {
      const code = outcome.codes.get(host) ?? null;
      queueMicrotask(() =>
        code
          ? server.emit("error", Object.assign(new Error(code), { code }))
          : server.emit("listening"),
      );
    };
    server.close = (done) => done();
    return server;
  },
  connect: ({ host }: { host: string }) => {
    const socket = new EventEmitter() as EventEmitter & {
      connecting: boolean;
      destroy(): void;
      resume(): void;
      end(): void;
    };
    socket.connecting = true;
    socket.destroy = () => undefined;
    socket.resume = () => undefined;
    socket.end = () => undefined;
    const accept = (): void => {
      socket.connecting = false;
      socket.emit("connect");
    };
    const answer = outcome.answers.get(host);
    queueMicrotask(() => {
      if (answer === "connect") accept();
      else if (answer === "timeout") socket.emit("timeout");
      else if (answer === "connect after timeout") {
        socket.emit("timeout");
        setTimeout(accept, 10);
      } else
        socket.emit("error", Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }));
    });
    return socket;
  },
}));

const { portProblem } = await import("../src/server/mock-manager/port-problem");

afterEach(() => {
  outcome.codes.clear();
  outcome.answers.clear();
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

  it.each(["127.0.0.1", "::1"])(
    "says a port something answers on at %s is in use, though both loopbacks let it bind",
    async (host) => {
      outcome.answers.set(host, "connect");

      expect(await portProblem(7001)).toBe("in use");
    },
  );

  it("counts a loopback that neither accepts nor refuses in time as unanswered", async () => {
    outcome.answers.set("127.0.0.1", "timeout");
    outcome.answers.set("::1", "timeout");

    expect(await portProblem(7001)).toBeNull();
  });

  it("says a port is in use when its connection is seen only after the timeout ran", async () => {
    outcome.answers.set("127.0.0.1", "connect after timeout");

    expect(await portProblem(7001)).toBe("in use");
  });
});
