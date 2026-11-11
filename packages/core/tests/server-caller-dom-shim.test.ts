// @vitest-environment jsdom
/**
 * The server's caller is the server's under a DOM shim too — jsdom puts a
 * `window` and a `document` on the global object, as Vitest and Jest run a
 * server's code under it: its call carries none of the page's session,
 * takes none of the page's cookies, and tells the platform's fetch to send
 * none of its own, so a fetch that keeps the page's cookies, as a DOM
 * shim's may, sends it none either. The page's caller keeps the page's
 * session there, as in a page. The side is the entry's.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createCaller as createPageCaller } from "../src/client/index";
import { courier, defineApi } from "../src/define/index";
import { createCaller } from "../src/index";

const { endpoint, stream } = courier();

/* What each request was handed to `fetch` with, and the page's cookies a fetch that keeps them
   would have added to it: one sends them as the Fetch standard does, to a request whose
   credentials are `include`, or `same-origin` — the default — for the page's own origin. */
interface Sent {
  url: string;
  init: RequestInit;
  pageCookies: string | undefined;
}

const sent: Sent[] = [];

function keepingCookies(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = new URL(String(input));
  const credentials = init?.credentials ?? "same-origin";
  const sends =
    credentials === "include" ||
    (credentials === "same-origin" && url.origin === window.location.origin);
  sent.push({ url: url.href, init: init ?? {}, pageCookies: sends ? document.cookie : undefined });
  if (url.pathname.endsWith("/live")) {
    return new Response("data: 1\n\n", { headers: { "content-type": "text/event-stream" } });
  }
  return Response.json({});
}

/* An API on the page's own origin, which a page sends its cookies by default. */
const api = defineApi({
  name: "accounts",
  baseURL: `${window.location.origin}/api`,
  session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => keepingCookies(input, init),
  endpoints: {
    me: endpoint.get("me"),
    rename: endpoint.post("me/name"),
    live: stream.response<number>().get("live"),
  },
});

afterEach(() => {
  sent.length = 0;
});

// biome-ignore lint/suspicious/noDocumentCookie: the cookies a page keeps are what the test sets
document.cookie = "sid=made-up-page-session";
// biome-ignore lint/suspicious/noDocumentCookie: the cookies a page keeps are what the test sets
document.cookie = "csrftoken=made-up-page-token";

describe("the server's caller under a DOM shim", () => {
  it("carries none of the page's session on a call no request is being served for", async () => {
    await createCaller(api).rename();

    const [call] = sent;
    expect(new Headers(call?.init.headers).get("x-csrftoken")).toBeNull();
    expect(new Headers(call?.init.headers).get("cookie")).toBeNull();
    expect(call?.init.credentials).toBe("omit");
    expect(call?.pageCookies).toBeUndefined();
  });

  it("carries the session of the request its context names, and none of the page's", async () => {
    const req = new Request("https://app.example.com/", { headers: { cookie: "sid=made-up" } });

    await createCaller(api, { context: { req } }).me();

    const [call] = sent;
    expect(new Headers(call?.init.headers).get("cookie")).toBe("sid=made-up");
    expect(call?.init.credentials).toBe("omit");
    expect(call?.pageCookies).toBeUndefined();
  });

  it("opens a stream with none of the page's session", async () => {
    const live = createCaller(api).live();
    for await (const _event of live) break;
    live.close();

    const [opened] = sent;
    expect(opened?.url).toMatch(/\/live$/);
    expect(opened?.init.credentials).toBe("omit");
    expect(opened?.pageCookies).toBeUndefined();
  });
});

describe("the page's caller under a DOM shim", () => {
  it("keeps the page's session, as in a page", async () => {
    await createPageCaller(api).rename();

    const [call] = sent;
    expect(new Headers(call?.init.headers).get("x-csrftoken")).toBe("made-up-page-token");
    expect(call?.init.credentials).toBe("include");
    expect(call?.pageCookies).toContain("sid=made-up-page-session");
  });
});
