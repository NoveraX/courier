/**
 * Which timeout a call runs under.
 *
 * A timeout given for one call is the most specific, then the endpoint's
 * own `.timeout()`, then the caller's default. The default used to be
 * written into every call's options, where it counted as given for that
 * call, so a client-wide 100 ms cut short an endpoint declared to take two
 * seconds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const realFetch = globalThis.fetch;
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream((_request, res) => {
    setTimeout(() => res.end("{}"), 300);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream.close();
});

function slowApi() {
  return defineApi({
    name: "slow",
    baseURL: upstream.url,
    endpoints: {
      patient: endpoint.get("patient").timeout(2000),
      brief: endpoint.get("brief").timeout(100),
      plain: endpoint.get("plain"),
    },
  });
}

function status(error: unknown): number | undefined {
  return error instanceof HTTPError ? error.status : undefined;
}

describe("a direct caller's default timeout", () => {
  it("gives way to the endpoint's own", async () => {
    const client = createCaller(slowApi(), { timeout: 100 });

    await expect(client.patient()).resolves.toEqual({});
  });

  it("applies to an endpoint without one", async () => {
    const client = createCaller(slowApi(), { timeout: 100 });

    expect(await client.plain().catch(status)).toBe(0);
  });

  it("gives way to a timeout given for the call", async () => {
    const client = createCaller(slowApi(), { timeout: 5000 });

    expect(await client.patient.with({ timeout: 100 })().catch(status)).toBe(0);
  });
});

describe("a proxy caller's default timeout", () => {
  beforeEach(() => {
    registerSources({ slow: slowApi() });
    const handler = createHandler();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.local"), init));
    });
  });

  it("does not replace the endpoint's own on the server", async () => {
    const client = createProxyCaller<ReturnType<typeof slowApi>>("slow", { timeout: 1000 });

    const error = await client.brief().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect(upstream.received).toHaveLength(1);
  });
});
