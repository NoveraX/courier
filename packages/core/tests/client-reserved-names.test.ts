/**
 * Groups and endpoints whose names the client also answers to.
 *
 * `raw` and `with` are the client's own accessors, and `then`, `toJSON` and
 * `valueOf` are read by the runtime itself — `await`, `JSON.stringify`,
 * coercion. The client answered those names before looking at the source,
 * so a group or an endpoint called by one of them, which the types offered
 * and a generator emits from an ordinary tag or operationId, was unreachable.
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
          raw: endpoint.get(":id/raw").variables<{ id: string }>(),
          with: endpoint.get(":id/with").variables<{ id: string }>(),
          valueOf: endpoint.get("value-of"),
          toJSON: endpoint.get("to-json"),
          then: endpoint.get("then"),
          list: endpoint.get(""),
        },
      }),
      raw: defineGroup({ prefix: "raw-group", endpoints: { listD: endpoint.get("list") } }),
      valueOf: defineGroup({ prefix: "value-group", endpoints: { list: endpoint.get("") } }),
      then: defineGroup({ prefix: "then-group", endpoints: { list: endpoint.get("") } }),
    },
  });
}

function urls(): string[] {
  return upstream.received.map((request) => request.url);
}

describe("an endpoint named like a client accessor", () => {
  it("is called as raw", async () => {
    await createCaller(namesApi()).files.raw({ id: "1" });

    expect(urls()).toEqual(["/files/1/raw"]);
  });

  it("leaves .raw reaching the group's other endpoints", async () => {
    const response = await createCaller(namesApi()).files.raw.list();

    expect(response.status).toBe(200);
    expect(urls()).toEqual(["/files"]);
  });

  it("is called as with", async () => {
    await createCaller(namesApi()).files.with({ id: "1" });

    expect(urls()).toEqual(["/files/1/with"]);
  });
});

describe("an endpoint named like a runtime hook", () => {
  it.each([
    ["valueOf", "/files/value-of"],
    ["toJSON", "/files/to-json"],
    ["then", "/files/then"],
  ] as const)("is called as %s", async (name, url) => {
    await createCaller(namesApi()).files[name]();

    expect(urls()).toEqual([url]);
  });
});

describe("a group named like a client accessor or a runtime hook", () => {
  it("is reached as raw, while .raw still reaches the other groups", async () => {
    const client = createCaller(namesApi());

    await client.raw.listD();
    const response = await client.raw.files.list();

    expect(urls()).toEqual(["/raw-group/list", "/files"]);
    expect(response.status).toBe(200);
  });

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
