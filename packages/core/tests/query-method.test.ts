/**
 * HTTP QUERY: a read that asks its question in a body. It is a read the way
 * GET is — its kind, its retries, its cache, its hop through the proxy — and
 * it sends its variables the way POST does. Every assertion here is on what
 * a real upstream received, so a request that looks right before it is sent
 * but arrives as another verb still fails.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { createFetch } from "../src/fetch";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { isReadingMethod, sendsVariablesInQuery } from "../src/utils/helpers";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";
import { type ProxyServer, startProxyServer } from "./helpers/proxy-server";

const { endpoint } = courier();
const Filter = z.object({ team: z.string(), status: z.array(z.string()) });
const FILTER = { team: "core", status: ["active", "invited"] };

let upstream: EchoServer;

function api() {
  return defineApi({
    name: "people",
    baseURL: upstream.origin,
    endpoints: {
      search: endpoint.query("people/search").variables(Filter),
      inTeam: endpoint.query("teams/:team/people").variables(Filter),
      paged: endpoint
        .variables(Filter)
        .via((http, filter) => http.query("people/search", filter, { searchParams: { page: 2 } }))
        .reads(),
    },
  });
}

function bodyOf(request: { body: Buffer }): unknown {
  return JSON.parse(request.body.toString());
}

beforeEach(async () => {
  upstream = await startEchoServer();
});

afterEach(async () => {
  _resetSourcesForTests();
  await upstream.close();
});

describe("an endpoint addressed with .query()", () => {
  it("is a read", () => {
    const search = endpoint.query("search");

    expect(search.method).toBe("query");
    expect(search.kind).toBe("query");
  });

  it("goes out as QUERY, its variables the JSON body", async () => {
    await createCaller(api()).search(FILTER);

    const sent = upstream.last();
    expect(sent.method).toBe("QUERY");
    expect(sent.url).toBe("/people/search");
    expect(sent.headers["content-type"]).toContain("application/json");
    expect(bodyOf(sent)).toEqual(FILTER);
  });

  it("fills its path from the variables and asks with the rest", async () => {
    await createCaller(api()).inTeam(FILTER);

    const sent = upstream.last();
    expect(sent.url).toBe("/teams/core/people");
    expect(bodyOf(sent)).toEqual({ status: ["active", "invited"] });
  });

  it("takes a query string beside its body when its closure names one", async () => {
    await createCaller(api()).paged(FILTER);

    const sent = upstream.last();
    expect(sent.method).toBe("QUERY");
    expect(sent.url).toBe("/people/search?page=2");
    expect(bodyOf(sent)).toEqual(FILTER);
  });

  it("reaches the upstream as QUERY through the proxy too", async () => {
    registerSources({ people: api() });
    const proxy: ProxyServer = await startProxyServer();
    try {
      await createProxyCaller<ReturnType<typeof api>>("people", {
        proxyPath: { http: proxy.url },
      }).search(FILTER);
    } finally {
      await proxy.close();
    }

    const sent = upstream.last();
    expect(sent.method).toBe("QUERY");
    expect(bodyOf(sent)).toEqual(FILTER);
  });
});

describe("a QUERY that fails on the server", () => {
  let flaky: Upstream;

  beforeEach(async () => {
    flaky = await startUpstream((_req, res, index) =>
      index === 0 ? sendJson(res, 503, { busy: true }) : sendJson(res, 200, []),
    );
  });

  afterEach(async () => {
    await flaky.close();
  });

  function flakyApi() {
    return defineApi({
      name: "flaky",
      baseURL: flaky.url,
      endpoints: {
        search: endpoint.query("search").variables<{ q: string }>().retry({ limit: 2, delay: 0 }),
        create: endpoint.post("people").variables<{ name: string }>().retry({ limit: 2, delay: 0 }),
      },
    });
  }

  it("is asked again, as a read is", async () => {
    await expect(createCaller(flakyApi()).search({ q: "ada" })).resolves.toEqual([]);

    expect(flaky.seen.map((seen) => seen.method)).toEqual(["QUERY", "QUERY"]);
  });

  it("is asked again where a write with the same policy is sent once", async () => {
    await expect(createCaller(flakyApi()).create({ name: "Ada" })).rejects.toMatchObject({
      status: 503,
    });

    expect(flaky.seen.map((seen) => seen.method)).toEqual(["POST"]);
  });
});

describe("createFetch's query", () => {
  it("sends QUERY with the JSON it is given", async () => {
    await createFetch({ baseURL: upstream.origin }).query("people/search", { json: FILTER });

    const sent = upstream.last();
    expect(sent.method).toBe("QUERY");
    expect(bodyOf(sent)).toEqual(FILTER);
  });
});

describe("isReadingMethod", () => {
  it("counts QUERY among the verbs that only read", () => {
    expect(["get", "HEAD", "options", "query", "QUERY"].map(isReadingMethod)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("does not count a verb that writes", () => {
    expect(["post", "PUT", "patch", "del", "DELETE"].map(isReadingMethod)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("sendsVariablesInQuery", () => {
  it("sends a read's variables in the query string, and a QUERY's in its body", () => {
    expect(["get", "HEAD", "options", "del", "DELETE"].map(sendsVariablesInQuery)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(["query", "POST", "put", "patch"].map(sendsVariablesInQuery)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
