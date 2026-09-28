/**
 * Groups and endpoints whose names the runtime reads as hooks.
 *
 * `then`, `toJSON` and `valueOf` are read by the runtime itself — `await`,
 * `JSON.stringify`, coercion. The client answered those names before looking
 * at the source, so a group or an endpoint called by one of them, which the
 * types offered and a generator emits from an ordinary tag or operationId,
 * was unreachable. The client's own accessors, `raw` and `with`, are refused
 * as names when the source is defined instead.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream(echo);
});

afterEach(async () => {
  await upstream.close();
});

function namesApi() {
  return defineApi({
    name: "names",
    baseURL: upstream.url,
    groups: {
      files: defineGroup({
        prefix: "files",
        endpoints: {
          valueOf: endpoint.get("value-of"),
          toJSON: endpoint.get("to-json"),
          then: endpoint.get("then"),
          list: endpoint.get(""),
        },
      }),
      valueOf: defineGroup({ prefix: "value-group", endpoints: { list: endpoint.get("") } }),
      then: defineGroup({ prefix: "then-group", endpoints: { list: endpoint.get("") } }),
    },
  });
}

function urls(): string[] {
  return upstream.received.map((request) => request.url);
}

describe("an endpoint named like a runtime hook", () => {
  it.each([
    ["valueOf", "/files/value-of"],
    ["toJSON", "/files/to-json"],
    ["then", "/files/then"],
  ] as const)("is called as %s", async (name, url) => {
    await createCaller(namesApi()).files[name]();

    expect(urls()).toEqual([url]);
  });

  it("leaves .raw reaching the group's endpoints", async () => {
    const response = await createCaller(namesApi()).files.raw.list();

    expect(response.status).toBe(200);
    expect(urls()).toEqual(["/files"]);
  });
});

describe("a group named like a runtime hook", () => {
  it("is reached as valueOf", async () => {
    await createCaller(namesApi()).valueOf.list();

    expect(urls()).toEqual(["/value-group"]);
  });

  it("is reached as then, and the client is still not awaited as a promise", async () => {
    const client = createCaller(namesApi());

    await client.then.list();
    const awaited = await Promise.resolve(client);

    expect(urls()).toEqual(["/then-group"]);
    expect(awaited).toBe(client);
  });

  it("is reached through .raw as well", async () => {
    const response = await createCaller(namesApi()).raw.then.list();

    expect(response.status).toBe(200);
    expect(urls()).toEqual(["/then-group"]);
  });

  it("is not a promise in a spread copy of the client either", async () => {
    const copy = { ...createCaller(namesApi()) };

    expect(await Promise.resolve(copy)).toBe(copy);
  });
});

describe("a client without those names in its source", () => {
  it("is not taken for a promise", async () => {
    const client = createCaller(
      defineApi({ name: "plain", baseURL: upstream.url, endpoints: { ping: endpoint.get("ping") } }),
    );

    expect(await Promise.resolve(client)).toBe(client);
    expect(JSON.stringify({ client })).toBe('{"client":{}}');
  });
});
