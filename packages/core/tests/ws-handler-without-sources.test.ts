/**
 * A socket handed to a handler before any sources are registered — before
 * `attachRuntime()` has run, say. One the handler refuses anyway, for a host
 * it does not serve, is refused without the sources being read; one it
 * would admit is closed as the server's fault, and why is logged. Nothing
 * is thrown into the adapter's upgrade, where it would end the process.
 */
import { format } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler } from "../src/adapter/ws-types";
import { _resetSourcesForTests } from "../src/server/sources";
import { createFakeSocket } from "./helpers/fake-socket";

const handlers: WSHandler[] = [];
let logged: string[] = [];

beforeEach(() => {
  _resetSourcesForTests();
  logged = [];
  for (const level of ["error", "warn"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(format(...args));
    });
  }
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  vi.restoreAllMocks();
});

function serve(config: Parameters<typeof createWSHandler>[0] = {}): WSHandler {
  const handler = createWSHandler({ heartbeatIntervalMs: 60_000, ...config });
  handlers.push(handler);
  return handler;
}

describe("a socket handed to a handler before any sources are registered", () => {
  it("is refused for a host the handler does not serve, without the sources being read", () => {
    const handler = serve({ allowedHosts: ["app.example"] });
    const socket = createFakeSocket();

    expect(() =>
      handler.handleSocket(socket, new Request("http://evil.example/api/ws"), "203.0.113.7"),
    ).not.toThrow();

    expect(socket.closed?.code).toBe(4421);
    expect(logged.join("\n")).not.toContain("No API sources are registered");
  });

  it("is closed as the server's fault when the handler would admit it, and why is logged", () => {
    const handler = serve();
    const socket = createFakeSocket();

    expect(() =>
      handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7"),
    ).not.toThrow();

    expect(socket.closed).toMatchObject({ code: 1011, reason: "Internal error" });
    expect(logged.join("\n")).toContain("No API sources are registered");
    expect(handler.connections.count).toBe(0);
  });
});
