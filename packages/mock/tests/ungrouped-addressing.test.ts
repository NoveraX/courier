import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAutoMockServer } from "../src/auto/create-auto-server";
import { MockTargetError } from "../src/auto/mock-target-error";

const { endpoint } = courier();

/**
 * A source that declares endpoints without groups is addressed with no group
 * at all, while the auto mock files its handlers under the collection the
 * records live in. Both addresses have to reach the same handler.
 */
const flatApi = defineApi({
  baseURL: "https://test.api",
  endpoints: {
    listUsers: endpoint.get("users").response(z.array(z.object({ id: z.string() }))),
    getUser: endpoint.get("users/:id").response(z.object({ id: z.string() })),
  },
});

const groupedApi = defineApi({
  baseURL: "https://test.api",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: { listUsers: endpoint.get("").response(z.array(z.object({ id: z.string() }))) },
    }),
    orders: defineGroup({
      prefix: "/orders",
      endpoints: { listUsers: endpoint.get("").response(z.array(z.object({ id: z.string() }))) },
    }),
  },
});

function serverFor(source: unknown) {
  return createAutoMockServer({
    source: source as never,
    port: 0,
    log: false,
    seed: { count: 3 },
  });
}

interface ProxyCall {
  source: string;
  group?: string;
  method: string;
  variables?: unknown;
}

/* The endpoint is named in the URL, as a proxy client names it. */
async function call(url: string, named: ProxyCall): Promise<{ status: number; body: unknown }> {
  const query = new URLSearchParams({ _s: named.source, _m: named.method });
  if (named.group) query.set("_g", named.group);
  const res = await fetch(`${url}/api/request?${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variables: named.variables }),
  });
  return { status: res.status, body: await res.json() };
}

describe("an ungrouped source", () => {
  const server = serverFor(flatApi);
  let url: string;

  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("answers a request that names no group", async () => {
    const { status, body } = await call(url, { source: "api", method: "listUsers" });

    expect(status).toBe(200);
    expect(body).toHaveLength(3);
  });

  it("answers a single-record request that names no group", async () => {
    const { status } = await call(url, {
      source: "api",
      method: "getUser",
      variables: { id: "id-1" },
    });

    expect(status).toBe(200);
  });

  it("still answers the collection's own REST path", async () => {
    const body = await fetch(`${url}/users`).then((r) => r.json());

    expect(body).toHaveLength(3);
  });
});

describe("a name two groups both claim", () => {
  const server = serverFor(groupedApi);
  let url: string;

  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("is not guessed at when no group is named", async () => {
    /* Answering one of them would be a coin toss; the caller has to say which. */
    const { status } = await call(url, { source: "api", method: "listUsers" });

    expect(status).toBe(404);
  });

  it("is answered when the group is named", async () => {
    const { status } = await call(url, { source: "api", group: "orders", method: "listUsers" });

    expect(status).toBe(200);
  });
});

/**
 * An endpoint declared outside any group is mocked under the collection its
 * path starts with, and only there: registered a second time under another
 * name, a call naming no group would match two handlers and be answered
 * 404.
 */
describe("a mock of an ungrouped endpoint under another collection", () => {
  it("is refused, naming the collection it belongs to", () => {
    expect(() =>
      createAutoMockServer({
        source: flatApi as never,
        port: 0,
        log: false,
        overrides: (mock) => {
          mock("people", "listUsers").resolves([]);
        },
      }),
    ).toThrow(MockTargetError);
    expect(() =>
      createAutoMockServer({
        source: flatApi as never,
        port: 0,
        log: false,
        overrides: (mock) => {
          mock("people", "listUsers").resolves([]);
        },
      }),
    ).toThrow('mock("users", "listUsers")');
  });

  it("is refused in a scenario too", () => {
    const server = createAutoMockServer({
      source: flatApi as never,
      port: 0,
      log: false,
      scenarios: {
        wrong: { name: "wrong", apply: (mock) => void mock("people", "listUsers").resolves([]) },
      },
    });

    expect(() => server.applyScenario(server.scenarios.wrong!)).toThrow(MockTargetError);
  });

  it("is taken under its own collection", async () => {
    const server = createAutoMockServer({
      source: flatApi as never,
      port: 0,
      log: false,
      overrides: (mock) => {
        mock("users", "listUsers").resolves([{ id: "only" }]);
      },
    });
    const url = (await server.start()).url;

    const { status, body } = await call(url, { source: "api", method: "listUsers" });
    await server.stop();

    expect([status, body]).toEqual([200, [{ id: "only" }]]);
  });
});
