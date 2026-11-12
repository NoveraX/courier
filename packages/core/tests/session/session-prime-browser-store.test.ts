/**
 * A write in a browser's page that asked for its double-submit token, on a
 * page that reads its cookies from a copy, as WebKit's does: the cookie the
 * token's answer set reaches the browser's store before the answer reaches
 * the page, and the page's copy only after it. The write reads its session
 * again from the store, through `cookieStore`, where the copy shows no
 * token yet. The core is loaded as a page's bundle takes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";

vi.mock("../../src/capabilities/registry", () => import("../../src/browser/capabilities/registry"));
vi.mock("../../src/studio/singleton", () => import("../../src/browser/studio/singleton"));

const { endpoint } = courier();
const fetchSpy = vi.fn();
/* The cookies the browser keeps, and the page's copy of them, which no answer's cookie reaches here. */
let kept: string[] = [];
let copy: string[] = [];
/* The cookies the token's answer sets. */
let tokenSets: string[] = [];

const page = {
  get cookie(): string {
    return copy.join("; ");
  },
};

const getAll = vi.fn(() =>
  Promise.resolve(
    kept.map((pair) => {
      const at = pair.indexOf("=");
      return { name: pair.slice(0, at), value: pair.slice(at + 1) };
    }),
  ),
);

/* Each address the token is asked at is warned about once: a check of the warning asks at its own. */
const api = (from = "csrf") =>
  createCaller(
    defineApi({
      name: "accounts",
      baseURL: "https://api.example.com",
      session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken", from } },
      endpoints: { me: endpoint.get("me"), signIn: endpoint.post("login") },
    }),
  );

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
  tokenSets = ["csrftoken=t-fresh"];
  getAll.mockClear();
  fetchSpy.mockReset();
  fetchSpy.mockImplementation((input: unknown) => {
    const url = input instanceof Request ? input.url : String(input);
    /* The browser keeps what the answer sets before the page has the answer. */
    if (new URL(url).pathname.startsWith("/csrf")) kept.push(...tokenSets);
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

describe("a write that asked for its token, on a page that sees the answer's cookie late", () => {
  it("repeats the token the answer set, as the browser keeps it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await api().signIn();

    expect(urlOf(0)).toBe("https://api.example.com/csrf");
    expect(urlOf(1)).toBe("https://api.example.com/login");
    expect(headersOf(1).get("x-csrftoken")).toBe("t-fresh");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("set no csrftoken");
  });

  it("repeats the first of the token's cookies the store lists, as the page's copy would", async () => {
    tokenSets = ["csrftoken=t-path", "csrftoken=t-root"];

    await api().signIn();

    expect(headersOf(1).get("x-csrftoken")).toBe("t-path");
  });

  it("goes without it, and says why, where the store fails to answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getAll.mockRejectedValueOnce(
      new DOMException("The page may not read cookies", "SecurityError"),
    );

    await api("csrf-failing").signIn();

    expect(headersOf(1).has("x-csrftoken")).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).toContain("set no csrftoken this call can read");
  });
});

describe("the browser's store is not asked", () => {
  it("by a write whose page's copy shows its token", async () => {
    kept = ["csrftoken=t0"];
    copy = ["csrftoken=t0"];

    await api().signIn();

    expect(getAll).not.toHaveBeenCalled();
    expect(headersOf(0).get("x-csrftoken")).toBe("t0");
  });

  it("by a read, which repeats no token", async () => {
    await api().me();

    expect(getAll).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
