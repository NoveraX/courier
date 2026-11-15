/**
 * A page on a rebound name, served by a Next.js route. Next keeps the
 * `X-Forwarded-Host` a request came with, and the page adds one to a call on
 * its own origin without a preflight, naming a host the app serves; the
 * `Host` its browser writes still names the page's own.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRoute } from "../src/api-route";
import { sseRoute } from "../src/sse-route";

/* An API nobody listens at: a call served would be answered 502. */
const { endpoint } = courier();
const api = defineApi({
  expose: true,
  baseURL: "http://127.0.0.1:9",
  endpoints: { ping: endpoint.get("ping"), rename: endpoint.post("rename") },
});
const route = apiRoute({ sources: { api } });
const stream = sseRoute({ sources: { api } });
const page = "rebound.example:3116";

/* A request as Next hands it to a route of the dev server on port 3116. */
function asNextGives(method: string, name: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3116/api/request?_s=api&_m=${name}`, {
    method,
    headers: { host: page, "x-forwarded-host": "localhost:3116", ...headers },
    ...(method === "POST" && { body: JSON.stringify({ variables: {} }) }),
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a rebound page that forwards a host the app serves itself", () => {
  it.each([
    ["a read", () => route.GET(asNextGives("GET", "ping"))],
    [
      "a write",
      () =>
        route.POST(
          asNextGives("POST", "rename", {
            origin: `http://${page}`,
            "content-type": "application/json",
          }),
        ),
    ],
    ["a stream", () => stream.GET(asNextGives("GET", "ping", { accept: "text/event-stream" }))],
  ])("is answered 421 for %s, naming the page's host", async (_kind, call) => {
    const answer = await call();

    expect(answer.status).toBe(421);
    expect(await answer.json()).toMatchObject({
      code: "HOST_NOT_ALLOWED",
      message: expect.stringContaining(`"${page}"`),
    });
  });
});
