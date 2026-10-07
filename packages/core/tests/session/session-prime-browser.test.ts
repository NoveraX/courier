/**
 * A browser calling an API whose double-submit token it has not been handed
 * yet: a write asks where the API hands the token out first — once, however
 * many writes wait — and repeats the token the browser then keeps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import type { CsrfOptions } from "../../src/session/types";

const { endpoint } = courier();
const fetchSpy = vi.fn();
let jar: string[] = [];
let setsToken = true;

/* What the page reads of the cookies the browser keeps. */
const page = {
  get cookie(): string {
    return jar.join("; ");
  },
};

function apiWith(csrf: CsrfOptions, baseURL = "https://api.example.com") {
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL,
      session: { cookies: ["sid"], csrf },
      endpoints: {
        me: endpoint.get("me"),
        rename: endpoint.post("me/name").variables<{ name: string }>(),
      },
    }),
  );
}

const SANCTUM = { cookie: "XSRF-TOKEN", header: "X-XSRF-TOKEN", from: "csrf-cookie" };

function urlOf(index: number): string {
  const input: unknown = fetchSpy.mock.calls[index]?.[0];
  return input instanceof Request ? input.url : String(input);
}

function initOf(index: number): RequestInit {
  return (fetchSpy.mock.calls[index]?.[1] ?? {}) as RequestInit;
}

beforeEach(() => {
  jar = [];
  setsToken = true;
  fetchSpy.mockReset();
  fetchSpy.mockImplementation((input: unknown) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes("csrf")) return Promise.resolve(Response.json({ ok: true }));
    /* The browser keeps the cookie the answer sets, and the page can read it. */
    if (setsToken) jar.push("XSRF-TOKEN=eyJ%3D");
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("document", page);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a write in a browser that finds no double-submit token", () => {
  it("asks where the API hands it out, with the browser's cookies, then repeats it", async () => {
    await apiWith(SANCTUM).rename({ name: "Ada" });

    expect(urlOf(0)).toBe("https://api.example.com/csrf-cookie");
    expect(initOf(0).method).toBe("GET");
    expect(initOf(0).credentials).toBe("include");
    expect(urlOf(1)).toBe("https://api.example.com/me/name");
    expect(new Headers(initOf(1).headers).get("x-xsrf-token")).toBe("eyJ=");
  });

  it("asks once for the writes that wait on it together", async () => {
    const api = apiWith(SANCTUM);

    await Promise.all([api.rename({ name: "Ada" }), api.rename({ name: "Grace" })]);

    const asked = fetchSpy.mock.calls.filter((_, index) => urlOf(index).includes("csrf"));
    expect(asked).toHaveLength(1);
    expect(new Headers(initOf(1).headers).get("x-xsrf-token")).toBe("eyJ=");
    expect(new Headers(initOf(2).headers).get("x-xsrf-token")).toBe("eyJ=");
  });

  it("lets a waiting write stop on its own signal while the others go on with the token", async () => {
    let answer: () => void = () => {};
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => {
            jar.push("XSRF-TOKEN=eyJ%3D");
            resolve(new Response(null, { status: 204 }));
          };
        }),
    );
    const api = apiWith(SANCTUM);
    const controller = new AbortController();

    const stopped = api.with({ signal: controller.signal }).rename({ name: "Ada" });
    const going = api.rename({ name: "Grace" });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    controller.abort();
    answer();

    await expect(stopped).rejects.toMatchObject({ name: "AbortError" });
    await going;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(new Headers(initOf(1).headers).get("x-xsrf-token")).toBe("eyJ=");
  });

  it("asks from the root of the API's origin for a path that starts there", async () => {
    const csrf = { ...SANCTUM, from: "/sanctum/csrf-cookie" };

    await apiWith(csrf, "https://app.example.com/api").rename({ name: "Ada" });

    expect(urlOf(0)).toBe("https://app.example.com/sanctum/csrf-cookie");
    expect(urlOf(1)).toBe("https://app.example.com/api/me/name");
  });

  it("asks under the API's address for a path that does not start at the root", async () => {
    await apiWith({ ...SANCTUM, from: "csrf/" }, "https://app.example.com/api").rename({
      name: "Ada",
    });

    expect(urlOf(0)).toBe("https://app.example.com/api/csrf/");
  });

  it("goes on without the token, and says why, when asking fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchSpy.mockImplementationOnce(() => Promise.resolve(new Response("down", { status: 503 })));

    await apiWith(SANCTUM).rename({ name: "Ada" });

    expect(urlOf(1)).toBe("https://api.example.com/me/name");
    expect(new Headers(initOf(1).headers).has("x-xsrf-token")).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).toContain("for the double-submit token failed");
  });

  it("goes on without the token, and says why, when the answer sets none the page can read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setsToken = false;

    await apiWith({ ...SANCTUM, from: "csrf-unreadable" }).rename({ name: "Ada" });

    expect(new Headers(initOf(1).headers).has("x-xsrf-token")).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).toContain("set no XSRF-TOKEN this call can read");
  });
});

describe("the request for the token", () => {
  it("goes through the API's middleware, which can tell it from an endpoint's call", async () => {
    const { defineMiddleware } = await import("../../src/middleware/define");
    const seen: Array<{ method: string; purpose: string | undefined }> = [];
    const signed = defineMiddleware("api key", "before", (ctx) => {
      seen.push({ method: ctx.method, purpose: ctx.purpose });
      ctx.headers.set("x-api-key", "k1");
    });
    const api = createCaller(
      defineApi({
        name: "accounts",
        baseURL: "https://api.example.com",
        session: { cookies: ["sid"], csrf: SANCTUM },
        middleware: [signed],
        endpoints: { rename: endpoint.post("me/name").variables<{ name: string }>() },
      }),
    );

    await api.rename({ name: "Ada" });

    expect(seen).toEqual([
      { method: "csrf token", purpose: "csrf-token" },
      { method: "rename", purpose: undefined },
    ]);
    expect(new Headers(initOf(0).headers).get("x-api-key")).toBe("k1");
  });

  it("is never answered from a cache, being made for the cookie its answer sets", async () => {
    const { cacheMiddleware } = await import("../../src/middleware/cache");
    const api = createCaller(
      defineApi({
        name: "accounts",
        baseURL: "https://api.example.com",
        session: { cookies: ["sid"], csrf: SANCTUM },
        middleware: [cacheMiddleware({ scope: "session" })],
        endpoints: { rename: endpoint.post("me/name").variables<{ name: string }>() },
      }),
    );

    await api.rename({ name: "Ada" });
    jar = [];
    await api.rename({ name: "Grace" });

    const asked = fetchSpy.mock.calls.filter((_, index) => urlOf(index).includes("csrf"));
    expect(asked).toHaveLength(2);
  });

  it("is told to Studio as a request the session makes, under an id of its own", async () => {
    const { studioHooks } = await import("../../src/studio");
    const started: Array<{ id: string; method: string; purpose?: string; httpMethod?: string }> =
      [];
    studioHooks.onRequestStart = (event) => started.push(event);
    try {
      await apiWith(SANCTUM).rename({ name: "Ada" });
    } finally {
      studioHooks.onRequestStart = undefined;
    }

    const [token, write] = [started.find((e) => e.purpose), started.find((e) => !e.purpose)];
    expect(token).toMatchObject({ method: "csrf token", purpose: "csrf-token", httpMethod: "GET" });
    expect(write?.method).toBe("rename");
    expect(token?.id).not.toBe(write?.id);
  });
});

describe("a browser asks for no token", () => {
  it("for a read, which repeats none", async () => {
    await apiWith(SANCTUM).me();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(urlOf(0)).toBe("https://api.example.com/me");
  });

  it("for a write that finds the token already", async () => {
    jar = ["XSRF-TOKEN=t0"];

    await apiWith(SANCTUM).rename({ name: "Ada" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(new Headers(initOf(0).headers).get("x-xsrf-token")).toBe("t0");
  });

  it("for an API that names no place it hands the token out", async () => {
    await apiWith({ cookie: "XSRF-TOKEN", header: "X-XSRF-TOKEN" }).rename({ name: "Ada" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(urlOf(0)).toBe("https://api.example.com/me/name");
  });
});
