/**
 * @vitest-environment node
 */
import { createServer, type Server } from "node:net";

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defineMockServer } from "../../src/managed/define-mock-server";
import type { ChildMessage } from "../../src/managed/types";
import { driveWorker } from "./drive-worker";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: { list: endpoint.get("").response<string[]>() },
    }),
  },
});

let holder: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (holder ? holder.close(() => resolve()) : resolve()));
  holder = undefined;
  Reflect.deleteProperty(process, "send");
  vi.restoreAllMocks();
});

function holdPort(): Promise<number> {
  return new Promise((resolve) => {
    holder = createServer();
    holder.listen(0, "127.0.0.1", () => {
      const address = holder?.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

describe("a mock whose port another process holds", () => {
  it("is reported with a short reason naming the port, not a stack trace", async () => {
    const port = await holdPort();
    const worker = driveWorker(defineMockServer({ source: api, log: "silent" }));

    worker.deliver({
      type: "start",
      mocksFile: "/app/courier.mocks.ts",
      mockKey: "api",
      port,
      transformCacheDirectory: null,
      storeFile: null,
    });
    const failure = await worker.next(
      (m): m is Extract<ChildMessage, { type: "error" }> => m.type === "error",
    );

    expect(failure).toEqual({
      type: "error",
      message: `Port ${port} is in use by another process.`,
      fatal: true,
      code: "PORT_IN_USE",
    });
  });
});

describe("a mock that fails to start for another reason", () => {
  it("is reported with the error's message, its stack left to the worker's log", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const worker = driveWorker(
      defineMockServer({
        source: api,
        log: "silent",
        overrides: () => {
          throw new Error("the overrides threw");
        },
      }),
    );

    worker.deliver({
      type: "start",
      mocksFile: "/app/courier.mocks.ts",
      mockKey: "api",
      port: 0,
      transformCacheDirectory: null,
      storeFile: null,
    });
    const failure = await worker.next(
      (m): m is Extract<ChildMessage, { type: "error" }> => m.type === "error",
    );

    expect(failure.message).toBe("the overrides threw");
    expect(stderr.mock.calls.flat().some((arg) => arg instanceof Error)).toBe(true);
  });
});

describe("a command that arrives before the mock runs", () => {
  it("is answered that the mock is still starting", async () => {
    const worker = driveWorker(defineMockServer({ source: api, log: "silent" }));

    const result = await worker.command({ action: "mock:store:seed", collection: "*" });

    expect(result).toMatchObject({
      type: "command-result",
      ok: false,
      error: "The mock is still starting. Try again once it runs.",
    });
  });
});

describe("a mock that starts", () => {
  it("says what network conditions it starts with: the ones its definition declares", async () => {
    const worker = driveWorker(
      defineMockServer({ source: api, log: "silent", network: { latency: 200, errorRate: 0.1 } }),
    );

    worker.deliver({
      type: "start",
      mocksFile: "/app/courier.mocks.ts",
      mockKey: "api",
      port: 0,
      transformCacheDirectory: null,
      storeFile: null,
    });
    const ready = await worker.next(
      (m): m is Extract<ChildMessage, { type: "ready" }> => m.type === "ready",
    );
    worker.deliver({ type: "stop" });

    expect(ready.network).toMatchObject({
      latency: 200,
      errorRate: 0.1,
      latencyPreset: "none",
      chaosPreset: "none",
    });
  });
});
