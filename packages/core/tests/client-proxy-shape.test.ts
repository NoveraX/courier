/**
 * The client object itself, as code that inspects it sees it.
 *
 * Reflection sees what it holds — `Object.keys`, `in` and spread list its
 * groups and endpoints; a read gives the same member every time, so a React
 * dependency array sees no change between renders; and `bind` or `call` on
 * an endpoint bind and call it, rather than name a method to request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const api = defineApi({
  baseURL: UPSTREAM,
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: {
        list: endpoint.get("").response<unknown>(),
        getById: endpoint.get(":id").variables<{ id: number }>().response<unknown>(),
      },
    }),
    tools: defineGroup({
      prefix: "tools",
      endpoints: { call: endpoint.post("call").response<unknown>() },
    }),
  },
  endpoints: { ping: endpoint.get("ping").variables<{ n?: number }>().response<unknown>() },
});

type Anything = Record<string, any>;
const requested: string[] = [];

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    requested.push(input instanceof Request ? input.url : String(input));
    return Response.json({ ok: true });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  requested.length = 0;
});

describe.each([
  ["createCaller", () => createCaller(api) as unknown as Anything],
  [
    "createProxyCaller with its source",
    () => createProxyCaller("api", { source: api }) as unknown as Anything,
  ],
])("%s", (_name, make) => {
  it("lists its groups and endpoints", () => {
    const client = make();

    expect(Object.keys(client).sort()).toEqual(["ping", "tools", "users"]);
    expect("users" in client).toBe(true);
    expect(Object.keys({ ...client }).sort()).toEqual(["ping", "tools", "users"]);
    expect(Object.keys(client.users).sort()).toEqual(["getById", "list"]);
  });

  it("gives the same member on every read", () => {
    const client = make();

    expect(client.users).toBe(client.users);
    expect(client.users.list).toBe(client.users.list);
    expect(client.raw).toBe(client.raw);
    expect(client.users.raw.list).toBe(client.users.raw.list);
  });
});

describe("function members of an endpoint", () => {
  it("bind and call the endpoint rather than request a method named bind", async () => {
    const client = createCaller(api) as unknown as Anything;

    const bound = client.ping.bind(null);
    expect(typeof bound).toBe("function");
    await bound({ n: 1 });
    await client.ping.call(null, { n: 2 });

    expect(requested).toEqual([`${UPSTREAM}/ping?n=1`, `${UPSTREAM}/ping?n=2`]);
  });

  it("still reach a method the source names call", async () => {
    const client = createCaller(api) as unknown as Anything;

    await client.tools.call();

    expect(requested).toEqual([`${UPSTREAM}/tools/call`]);
  });
});
