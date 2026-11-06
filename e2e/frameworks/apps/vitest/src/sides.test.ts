// @vitest-environment jsdom
import { createCaller } from "@noverax/courier";
import { createCaller as createPageCaller } from "@noverax/courier/client";
import { courier, defineApi } from "@noverax/courier/define";
import { expect, it } from "vitest";

/* Vitest's jsdom takes the core's modules for a server, not the page's: what a server lends in a
   test is read by the calls of its process. A page's caller's call made while no request is being
   served keeps the page's session, as in a page; the root's caller is the server's, and its call
   carries none of it. */
const { endpoint } = courier();
const sent: RequestInit[] = [];

const api = defineApi({
  name: "accounts",
  baseURL: "https://api.example.com",
  session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
  fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(init ?? {});
    return Response.json({});
  },
  endpoints: { me: endpoint.get("me"), rename: endpoint.post("me/name") },
});

it("carries the session of the request a call's context names, under jsdom", async () => {
  const req = new Request("https://app.example.com/", { headers: { cookie: "sid=made-up" } });

  await createCaller(api, { context: { req } }).me();

  expect(new Headers(sent.at(-1)?.headers).get("cookie")).toBe("sid=made-up");
});

it("keeps the page's session for a page's caller's call no request is being served for, under jsdom", async () => {
  // biome-ignore lint/suspicious/noDocumentCookie: the cookie a page keeps is what the test sets
  document.cookie = "csrftoken=t0k3n";

  await createPageCaller(api).rename();

  expect(new Headers(sent.at(-1)?.headers).get("x-csrftoken")).toBe("t0k3n");
  expect(sent.at(-1)?.credentials).toBe("include");
});

it("carries no page's session for the server's caller's call no request is being served for, under jsdom", async () => {
  // biome-ignore lint/suspicious/noDocumentCookie: the cookie a page keeps is what the test sets
  document.cookie = "csrftoken=t0k3n";

  await createCaller(api).rename();

  expect(new Headers(sent.at(-1)?.headers).get("x-csrftoken")).toBeNull();
  expect(sent.at(-1)?.credentials).toBeUndefined();
});
