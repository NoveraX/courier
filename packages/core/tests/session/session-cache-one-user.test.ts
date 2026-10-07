/**
 * A cache in a browser or a React Native app, where the platform sends the
 * session's cookies itself and no script sees them: a public cache keeps
 * none of a session API's answers, and a session cache keeps one user's
 * reads from the next one's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CacheScope } from "../../src/middleware/cache";

const fetchSpy = vi.fn();
let jar: string[] = [];
let served = 0;

/* What the page reads of the cookies the browser keeps: the session's own is HttpOnly. */
const page = {
  get cookie(): string {
    return jar.join("; ");
  },
};

async function accountsCached(scope: CacheScope) {
  const { createCaller } = await import("../../src/caller");
  const { defineApi } = await import("../../src/define/api");
  const { courier } = await import("../../src/define/courier");
  const { cacheMiddleware } = await import("../../src/middleware/cache");
  const { endpoint } = courier();
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL: "https://api.example.com",
      session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
      middleware: [cacheMiddleware({ scope, ttl: 60_000 })],
      endpoints: {
        me: endpoint.get("me"),
        signIn: endpoint.post("login").variables<{ user: string }>(),
      },
    }),
  );
}

function reads(): number {
  return fetchSpy.mock.calls.filter(([input]) => String(input).endsWith("/me")).length;
}

beforeEach(() => {
  vi.resetModules();
  jar = [];
  served = 0;
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(() => Promise.resolve(Response.json({ answer: ++served })));
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("document", page);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a public cache in a browser", () => {
  it("keeps none of a session API's answers, though no session cookie is in the page's reach", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = await accountsCached("public");

    await api.me();
    await api.me();

    expect(reads()).toBe(2);
  });
});

describe("a session cache in a browser", () => {
  it("serves the user's reads again", async () => {
    const api = await accountsCached("session");

    const first = await api.me();
    const second = await api.me();

    expect(reads()).toBe(1);
    expect(second).toEqual(first);
  });

  it("keeps what it held before a sign-in from the user signed in", async () => {
    const api = await accountsCached("session");

    await api.me();
    await api.signIn({ user: "grace" });
    await api.me();

    expect(reads()).toBe(2);
  });

  it("does not serve after a write a read made while the write was under way", async () => {
    let answerSignIn: () => void = () => {};
    fetchSpy.mockImplementation((input: unknown) => {
      if (!String(input).endsWith("/login"))
        return Promise.resolve(Response.json({ answer: ++served }));
      return new Promise((resolve) => {
        answerSignIn = () => resolve(Response.json({ ok: true }));
      });
    });
    const api = await accountsCached("session");

    const signingIn = api.signIn({ user: "grace" });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await api.me();
    answerSignIn();
    await signingIn;
    await api.me();

    expect(reads()).toBe(2);
  });

  it("keeps apart the reads made before and after another tab signed in, as the token the page reads changes", async () => {
    const api = await accountsCached("session");
    jar = ["csrftoken=t-ada"];

    await api.me();
    jar = ["csrftoken=t-grace"];
    await api.me();

    expect(reads()).toBe(2);
  });
});

describe("a session cache in a React Native app", () => {
  it("keeps what it held before a sign-in from the user signed in", async () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("navigator", { product: "ReactNative" });
    const api = await accountsCached("session");

    await api.me();
    await api.me();
    await api.signIn({ user: "grace" });
    await api.me();

    expect(reads()).toBe(2);
  });
});
