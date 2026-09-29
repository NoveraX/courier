/**
 * A caller guessing names off the wire must learn nothing from the shape of
 * the refusal. The exposure gate already hides endpoints; this pins the level
 * above it, where an unknown *source* used to be answered differently from an
 * unknown method and so announced the registry one guess at a time.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveSSEEndpoint } from "../src/adapter/sse-resolve";
import { courier, defineApi } from "../src/define/index";
import type { Context } from "../src/http-client/types";
import { executeRequest } from "../src/utils/execute";

const { endpoint, stream } = courier();

const publicApi = defineApi({
  baseURL: "https://public.example",
  endpoints: { list: endpoint.get("items").response<unknown>() },
});

/** Declared server-only: the browser may not reach it, or learn it is there. */
const adminApi = defineApi({
  baseURL: "https://admin.internal",
  expose: false,
  endpoints: {
    purge: endpoint.post("purge").response<unknown>(),
    feed: stream.get("events").response<unknown>(),
  },
});

const sources = { publicApi, adminApi };

/** What a proxy caller is told. */
async function overWire(source: string, method: string): Promise<string> {
  try {
    const res = (await executeRequest(
      sources,
      { source, method, variables: {}, options: {} } as never,
      { proxyMethod: "POST", fromWire: true } as Context,
    )) as Response;
    return `${res.status} ${((await res.json()) as { message: string }).message}`;
  } catch (error) {
    const e = error as { status?: number; data?: { message?: string } };
    return `${e.status} ${e.data?.message}`;
  }
}

/** What code running in this process is told. */
async function inProcess(source: string, method: string): Promise<string> {
  try {
    await executeRequest(sources, { source, method, variables: {} } as never);
    return "resolved";
  } catch (error) {
    const e = error as { status?: number; data?: { message?: string } };
    return `${e.status} ${e.data?.message}`;
  }
}

describe("a refusal does not say which half of the name was wrong", () => {
  it("answers an unknown source exactly as an unknown method", async () => {
    expect(await overWire("nosuchsource", "nope")).toBe(
      "400 [nosuchsource][nope]: method not found",
    );
    expect(await overWire("publicApi", "nope")).toBe("400 [publicApi][nope]: method not found");
  });

  it("answers a source the developer closed exactly the same way", async () => {
    expect(await overWire("adminApi", "purge")).toBe("400 [adminApi][purge]: method not found");
    expect(await overWire("adminApi", "nope")).toBe("400 [adminApi][nope]: method not found");
  });

  /** Every refusal differs only by the caller's own echoed input. */
  it("leaves one distinguishable shape across the whole guess space", async () => {
    const shapes = new Set(
      await Promise.all([
        overWire("nosuchsource", "nope"),
        overWire("publicApi", "nope"),
        overWire("adminApi", "purge"),
        overWire("adminApi", "feed"),
      ]).then((answers) => answers.map((a) => a.replace(/\[[^\]]*\]/g, "[]"))),
    );

    expect([...shapes]).toEqual(["400 [][]: method not found"]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a caller in this process still hears the real mistake", () => {
  it("names the source when the source is what is missing", async () => {
    expect(await inProcess("nosuchsource", "nope")).toBe("400 [nosuchsource]: source not found");
  });

  it("names the method when the method is what is missing", async () => {
    expect(await inProcess("publicApi", "nope")).toBe("400 [publicApi][nope]: method not found");
  });

  /** `expose` governs the wire, not this process. */
  it("reaches an endpoint the wire may not", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    expect(await inProcess("adminApi", "purge")).toBe("resolved");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe("SSE applies the same rule", () => {
  async function resolve(source: string, method: string): Promise<string> {
    const result = resolveSSEEndpoint(sources as never, source, undefined, method);
    if (!(result instanceof Response)) return "resolved";
    return `${result.status} ${((await result.json()) as { message: string }).message}`;
  }

  it("answers an unknown source as an unknown method", async () => {
    expect(await resolve("nosuchsource", "nope")).toBe(
      "400 [nosuchsource][][nope]: method not found",
    );
  });

  it("hides a stream on a closed source", async () => {
    expect(await resolve("adminApi", "feed")).toBe("400 [adminApi][][feed]: method not found");
  });
});

describe("a call that leaves a name out", () => {
  it("is told which name is missing, rather than read as a guess at one", async () => {
    expect(await inProcess(undefined as never, "list")).toBe(
      "400 [source] is required: the call names no source",
    );
    expect(await inProcess("publicApi", "")).toBe(
      "400 [method] is required: the call names no endpoint",
    );
  });
});
