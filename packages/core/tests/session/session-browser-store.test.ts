/**
 * A call in a browser's page that takes a token from the cookies — a write
 * its double-submit token, any call a bearer token — on a page that reads
 * its cookies from a copy, as WebKit's does: a cookie an answer set reaches
 * the browser's store before the answer reaches the page, and the page's
 * copy only after it. Such a call reads the cookies from the store, through
 * `cookieStore`; a call that takes no token, or one whose page has no
 * store or a store that fails, reads the copy. The core is loaded as a
 * page's bundle takes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import type { SessionOptions } from "../../src/session/types";

vi.mock("../../src/capabilities/registry", () => import("../../src/browser/capabilities/registry"));
vi.mock("../../src/studio/singleton", () => import("../../src/browser/studio/singleton"));

const { endpoint } = courier();
const fetchSpy = vi.fn();
/* The cookies the browser keeps, and the page's copy of them, which no answer's cookie reaches here. */
let kept: string[] = [];
let copy: string[] = [];
/* The cookies the answer at each path sets. */
let sets: Record<string, string[]> = {};

const page = {
  get cookie(): string {
    return copy.join("; ");
  },
};

const getAll = vi.fn<() => Promise<unknown>>();

/* Each address the token is asked at is warned about once: a check of the warning asks at its own. */
const withToken = (from = "csrf"): SessionOptions => ({
  cookies: ["sid"],
  csrf: { cookie: "csrftoken", header: "x-csrftoken", from },
});

function apiWith(session: SessionOptions) {
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL: "https://api.example.com",
      session,
      endpoints: {
        me: endpoint.get("me"),
        signIn: endpoint.post("login"),
        rename: endpoint.post("me/name"),
      },
    }),
  );
}

/* The browser keeps a cookie an answer set in place of the one of its name. */
function keep(pairs: readonly string[]): void {
  for (const pair of pairs) {
    const name = pair.slice(0, pair.indexOf("=") + 1);
    kept = [...kept.filter((each) => !each.startsWith(name)), pair];
  }
}

function urlOf(index: number): string {
  const input: unknown = fetchSpy.mock.calls[index]?.[0];
  return input instanceof Request ? input.url : String(input);
}

function headersOf(index: number): Headers {
  return new Headers(((fetchSpy.mock.calls[index]?.[1] ?? {}) as RequestInit).headers);
}

beforeEach(() => {
  kept = [];
  copy = [];
  sets = { "/csrf": ["csrftoken=t-fresh"] };
  getAll.mockReset();
  getAll.mockImplementation(() =>
    Promise.resolve(
      kept.map((pair) => {
        const at = pair.indexOf("=");
        return { name: pair.slice(0, at), value: pair.slice(at + 1) };
      }),
    ),
  );
  fetchSpy.mockReset();
  fetchSpy.mockImplementation((input: unknown) => {
    const url = input instanceof Request ? input.url : String(input);
    /* The browser keeps what the answer sets before the page has the answer. */
    keep(sets[new URL(url).pathname] ?? []);
    return Promise.resolve(Response.json({ ok: true }));
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("document", page);
  vi.stubGlobal("cookieStore", { getAll });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a call whose page sees an answer's cookies late", () => {
  it("repeats the double-submit token the answer it asked for set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await apiWith(withToken()).signIn();

    expect(urlOf(0)).toBe("https://api.example.com/csrf");
    expect(urlOf(1)).toBe("https://api.example.com/login");
    expect(headersOf(1).get("x-csrftoken")).toBe("t-fresh");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("set no csrftoken");
  });

  it("repeats the token an answer just renewed, not the one before it", async () => {
    kept = ["csrftoken=t-old"];
    copy = ["csrftoken=t-old"];
    sets["/login"] = ["csrftoken=t-new"];
    const api = apiWith(withToken());

    await api.signIn();
    await api.rename();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(headersOf(0).get("x-csrftoken")).toBe("t-old");
    expect(headersOf(1).get("x-csrftoken")).toBe("t-new");
  });

  it("repeats the first of the token's cookies the store lists, as the page's copy would", async () => {
    kept = ["csrftoken=t-path", "csrftoken=t-root"];

    await apiWith(withToken()).signIn();

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(headersOf(0).get("x-csrftoken")).toBe("t-path");
  });

  it("sends the bearer token an answer just set", async () => {
    sets["/login"] = ["at=abc"];
    const api = apiWith({ cookies: ["sid"], bearer: "at" });

    await api.signIn();
    await api.me();

    expect(headersOf(0).has("authorization")).toBe(false);
    expect(urlOf(1)).toBe("https://api.example.com/me");
    expect(headersOf(1).get("authorization")).toBe("Bearer abc");
  });
});

describe("a call reads the page's copy of its cookies", () => {
  it("when it takes no token from them, asking the store nothing", async () => {
    copy = ["csrftoken=t0"];

    await apiWith(withToken()).me();

    expect(getAll).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(headersOf(0).has("x-csrftoken")).toBe(false);
  });

  it("where the page has no store", async () => {
    vi.stubGlobal("cookieStore", undefined);
    kept = ["at=kept"];
    copy = ["at=copied"];

    await apiWith({ cookies: ["sid"], bearer: "at" }).me();

    expect(getAll).not.toHaveBeenCalled();
    expect(headersOf(0).get("authorization")).toBe("Bearer copied");
  });

  it("where the store fails, and a write that finds no token there goes without it, saying why", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getAll.mockRejectedValue(new DOMException("The page may not read cookies", "SecurityError"));

    await apiWith(withToken("csrf-failing")).signIn();

    expect(urlOf(0)).toBe("https://api.example.com/csrf-failing");
    expect(headersOf(1).has("x-csrftoken")).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).toContain("set no csrftoken this call can read");
  });
});
