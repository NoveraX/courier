// @vitest-environment jsdom
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { expect, it } from "vitest";

/* Vitest's jsdom takes the core's modules for a server, not the page's: what a server lends in a
   test is read by the calls of its process, and a call made while no request is being served
   keeps the page's session, as in a page. */
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

it("keeps the page's session for a call no request is being served for, under jsdom", async () => {
  // biome-ignore lint/suspicious/noDocumentCookie: the cookie a page keeps is what the test sets
  document.cookie = "csrftoken=t0k3n";

  await createCaller(api).rename();

  expect(new Headers(sent.at(-1)?.headers).get("x-csrftoken")).toBe("t0k3n");
  expect(sent.at(-1)?.credentials).toBe("include");
});
