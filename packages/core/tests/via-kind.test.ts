/**
 * What an HTTP endpoint is — a read or a write — follows from the verb that
 * addresses it, whether named on the chain or called by a `.via()` closure:
 * the type and the runtime read it alike. `.reads()` and `.writes()` say
 * otherwise, and are how a closure that calls a reading verb on one path and
 * a writing verb on another says which it is. Every call keeps to what was
 * decided: a closure the probe saw read cannot write on a later call.
 */
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import type { InferKind } from "../src/define/marker";
import type { HttpWire } from "../src/define/probe";
import { routesOf } from "../src/define/routes-of";
import { isConfigurationError } from "../src/errors";
import { retryMiddleware } from "../src/middleware/index";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

/** A caller of `endpoints` against an upstream that fails its first answer with 503, then answers. */
async function flakyCaller(endpoints: Record<string, unknown>) {
  upstream = await startUpstream((_req, res, index) =>
    sendJson(res, index === 0 ? 503 : 200, index === 0 ? { message: "busy" } : { total: 3 }),
  );
  return createCaller(
    defineApi({
      name: "api",
      baseURL: upstream.url,
      middleware: [retryMiddleware({ limit: 2, delay: 1 })],
      endpoints,
    } as Parameters<typeof defineApi>[0]),
  ) as unknown as Record<string, (variables?: unknown) => Promise<unknown>>;
}

function routeOf(name: string, built: object): unknown {
  const api = defineApi({
    name: "api",
    baseURL: "https://api.example.com",
    expose: true,
    groups: { reports: defineGroup({ endpoints: { [name]: built } as never }) },
  });
  return routesOf(api, "api").endpoints[`reports.${name}`];
}

describe("a .via() closure that reads with GET", () => {
  const byYear = endpoint
    .variables<{ year: number }>()
    .via((http, { year }) => http.get(http.path`reports/${year}/summary`, undefined))
    .response<{ total: number }>();

  it("is a read", () => {
    expect(byYear.kind).toBe("query");
    expectTypeOf<InferKind<typeof byYear>>().toEqualTypeOf<"query">();
  });

  it("is retried as a read is", async () => {
    const client = await flakyCaller({ byYear });

    await expect(client.byYear?.({ year: 2026 })).resolves.toEqual({ total: 3 });

    expect(upstream?.seen).toHaveLength(2);
  });

  it("is routed to a page as a read", () => {
    expect(routeOf("byYear", byYear)).toEqual({ type: "query" });
  });

  it("may keep its answer, as a read may", () => {
    expect(() => byYear.cache({ revalidate: 60 })).not.toThrow();
  });

  it("may be offered to an agent as a read", () => {
    expect(() => byYear.agent({ description: "A year's report", access: "read" })).not.toThrow();
  });
});

describe("a .via() closure that writes", () => {
  const rename = endpoint
    .variables<{ id: number; name: string }>()
    .via((http, { name }) => http.post(":id/rename", { name }));

  it("is a write, in its type and as it runs", () => {
    expect(rename.kind).toBe("mutation");
    expectTypeOf<InferKind<typeof rename>>().toEqualTypeOf<"mutation">();
  });

  it("calls whichever writing verb a call takes", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, {}));
    const save = endpoint
      .variables<{ id?: number; name: string }>()
      .via((http, user) => (user.id ? http.put(":id", user) : http.post("", user)));
    expectTypeOf<InferKind<typeof save>>().toEqualTypeOf<"mutation">();
    const client = createCaller(
      defineApi({ name: "api", baseURL: upstream.url, endpoints: { save } }),
    );

    await client.save({ name: "new" });
    await client.save({ id: 7, name: "known" });

    expect(upstream.seen.map((seen) => `${seen.method} ${seen.url}`)).toEqual(["POST /", "PUT /7"]);
  });

  it("refuses .cache() with the verb its closure called", () => {
    expect(() => (rename as unknown as { cache(config: object): unknown }).cache({})).toThrow(
      /\.cache\(\) was named on an endpoint addressed with \.post\(\)/,
    );
  });
});

describe("a .via() closure that reads on one path and writes on another", () => {
  type Search = { q: string; long: boolean };
  const both = (http: HttpWire, v: Search) =>
    v.long ? http.post("search", v) : http.get("search", v);

  it("is no endpoint until .reads() or .writes() names its kind", () => {
    const unnamed = endpoint.variables<Search>().via(both);

    defineGroup({
      endpoints: {
        // @ts-expect-error — the closure calls a reading and a writing verb, so its kind is named
        search: unnamed,
      },
    });
    defineGroup({ endpoints: { search: unnamed.reads() } });
    defineGroup({ endpoints: { search: unnamed.writes() } });
  });

  it("is what .reads() or .writes() names", () => {
    const read = endpoint.variables<Search>().via(both).reads();
    const write = endpoint.variables<Search>().via(both).writes();

    expectTypeOf<InferKind<typeof read>>().toEqualTypeOf<"query">();
    expectTypeOf<InferKind<typeof write>>().toEqualTypeOf<"mutation">();
    expect([read.kind, write.kind]).toEqual(["query", "mutation"]);
  });

  it("named a read, calls either verb", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, []));
    const search = endpoint.variables<Search>().via(both).reads();
    const client = createCaller(
      defineApi({ name: "api", baseURL: upstream.url, endpoints: { search } }),
    );

    await client.search({ q: "a", long: false });
    await client.search({ q: "a", long: true });

    expect(upstream.seen.map((seen) => seen.method)).toEqual(["GET", "POST"]);
  });
});

describe("a call that leaves the kind its endpoint was given", () => {
  it("is refused before it is sent, when the probe saw the closure read", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, {}));
    /* Typed loosely, as plain JavaScript is: the probe's stand-ins take the reading branch. */
    const loose = endpoint
      .variables<{ save: boolean }>()
      .via(((
        http: Record<string, (path: string, body?: unknown) => never>,
        v: { save: boolean },
      ) =>
        v.save === true
          ? http.post?.("notes", v)
          : http.get?.("notes")) as never) as unknown as object;
    const client = createCaller(
      defineApi({ name: "api", baseURL: upstream.url, endpoints: { notes: loose } } as never),
    ) as unknown as Record<string, (variables: unknown) => Promise<unknown>>;
    expect((loose as { kind: string }).kind).toBe("query");

    await client.notes?.({ save: false });
    const refusal = await client.notes?.({ save: true }).catch((error: unknown) => error);

    expect(isConfigurationError(refusal)).toBe(true);
    expect(refusal).toMatchObject({ code: "ENDPOINT_VERB_KIND" });
    expect(String(refusal)).toMatch(/called \.post\(\) on an endpoint its verb made a read/);
    expect(upstream.seen.map((seen) => seen.method)).toEqual(["GET"]);
  });

  it("is refused when a declared read calls a verb that changes what it addresses", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, {}));
    const loose = endpoint
      .variables<{ replace: boolean }>()
      .via(((
        http: Record<string, (path: string, body?: unknown) => never>,
        v: { replace: boolean },
      ) => (v.replace === true ? http.put?.("notes", v) : http.post?.("notes/search", v))) as never)
      .reads() as unknown as object;
    const client = createCaller(
      defineApi({ name: "api", baseURL: upstream.url, endpoints: { notes: loose } } as never),
    ) as unknown as Record<string, (variables: unknown) => Promise<unknown>>;

    const refusal = await client.notes?.({ replace: true }).catch((error: unknown) => error);

    expect(refusal).toMatchObject({ code: "ENDPOINT_VERB_KIND" });
    expect(String(refusal)).toMatch(/called \.put\(\) on an endpoint \.reads\(\) declared a read/);
    expect(upstream.seen).toHaveLength(0);
  });

  it("goes ahead when a declared write calls a reading verb", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, {}));
    const ping = endpoint.get("ping").writes();
    const client = createCaller(
      defineApi({ name: "api", baseURL: upstream.url, endpoints: { ping } }),
    );

    await client.ping();

    expect(upstream.seen.map((seen) => seen.method)).toEqual(["GET"]);
  });
});
