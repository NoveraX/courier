import { createCaller, HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MockServer } from "../../src/server/create-mock-server";
import { createMockServer } from "../../src/server/create-mock-server";

const { endpoint } = courier();

let server: MockServer;
let url: string;

/** A Courier client that reaches the mock through its proxy route */
function proxyRouteClient(timeout?: number) {
  const api = defineApi({
    baseURL: url,
    groups: {
      users: defineGroup({
        prefix: "api",
        endpoints: {
          getAll: endpoint.post("request").variables<{ group: string; method: string }>(),
        },
      }),
    },
  });
  const client = createCaller(api, { timeout });
  return () => client.users.getAll({ group: "users", method: "getAll" });
}

beforeAll(async () => {
  server = createMockServer({ port: 0, log: false });
  server.mock("users", "getAll").resolves(["alice"]);
  ({ url } = await server.start());
});

afterAll(async () => {
  await server.stop();
});

function call(signal?: AbortSignal): Promise<Response> {
  return fetch(`${url}/api/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group: "users", method: "getAll" }),
    signal,
  });
}

/** Wait until the server has recorded the request that `run` made, and return that entry */
async function recordedAfter(run: () => Promise<unknown>) {
  const before = server.history.length;
  await run();
  await vi.waitFor(() => expect(server.history).toHaveLength(before + 1), { timeout: 1000 });
  return server.history.at(-1);
}

async function timed<TResult>(run: () => Promise<TResult>): Promise<[TResult, number]> {
  const start = performance.now();
  const result = await run();
  return [result, performance.now() - start];
}

describe("a timeout fault on the mock server", () => {
  it("holds the request for the configured timeout before answering", async () => {
    server.networkState.setConfig({ errorRate: 1, faultTypes: ["timeout"], timeout: 200 });

    const [response, elapsed] = await timed(() => call());

    expect(elapsed).toBeGreaterThanOrEqual(190);
    expect(response.status).toBe(408);
  });

  it("outlasts a client timeout shorter than its own, so the client's timeout fires", async () => {
    server.networkState.setConfig({ errorRate: 1, faultTypes: ["timeout"] });
    let error: unknown;

    await recordedAfter(async () => {
      error = await proxyRouteClient(150)().catch((caught: unknown) => caught);
    });

    expect(error).toBeInstanceOf(HTTPError);
    expect(error instanceof HTTPError && error.status).toBe(0);
    expect(error instanceof HTTPError && error.cause instanceof Error && error.cause.name).toBe(
      "TimeoutError",
    );
  });

  it("stops holding a request whose client went away", async () => {
    server.networkState.setConfig({ errorRate: 1, faultTypes: ["timeout"] });

    const entry = await recordedAfter(() => call(AbortSignal.timeout(100)).catch(() => undefined));

    expect(entry?.error?.message).toContain("Timeout");
    expect(entry?.duration).toBeGreaterThanOrEqual(90);
    expect(entry?.duration).toBeLessThan(1000);
  });
});

describe("a reset fault on the mock server", () => {
  it("drops the connection without an answer", async () => {
    server.networkState.setConfig({ errorRate: 1, faultTypes: ["reset"] });
    let error: unknown;

    const entry = await recordedAfter(async () => {
      error = await call().catch((caught: unknown) => caught);
    });

    expect(error).toBeInstanceOf(TypeError);
    expect(entry?.error?.message).toContain("Reset");
  });

  it("reaches a Courier client as a failure to get an answer, not as an HTTP status", async () => {
    server.networkState.setConfig({ errorRate: 1, faultTypes: ["reset"] });

    const error = await proxyRouteClient()().catch((caught: unknown) => caught);

    expect(error instanceof HTTPError && error.status).toBe(0);
  });
});
