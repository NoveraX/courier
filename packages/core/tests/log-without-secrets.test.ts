/**
 * No credential reaches the server's log, on any path a failure takes to
 * it: a middleware's own error the proxy answers with "Request failed", an
 * upstream it could not reach, the log middleware's line — in text and in
 * JSON — nor the answer the browser gets, from the proxy or in the
 * `Response` a direct call is answered with.
 */
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { courier, defineApi } from "../src/define/index";
import type { Context } from "../src/http-client/types";
import { defineMiddleware, logMiddleware } from "../src/middleware/index";
import type { Middleware } from "../src/middleware/types";
import { executeRequest } from "../src/utils/execute";

/* Made up, and joined at run time so no literal sits in the source for a secret scanner. */
const SECRET = ["Zq9x7", "Kp2Lm", "4Nw8"].join("");

const { endpoint } = courier();
const fetchSpy = vi.fn();

function sourcesWith(middleware: Middleware[]) {
  const api = defineApi({
    expose: true,
    baseURL: "https://internal-api.corp.example",
    middleware,
    endpoints: { items: endpoint.get("items").response<unknown>() },
  });
  return { api };
}

/** Run the call as the proxy does, and return the browser's answer as text. */
async function throughProxy(middleware: Middleware[]): Promise<string> {
  const answer = (await executeRequest(
    sourcesWith(middleware),
    { source: "api", method: "items" } as never,
    {
      res: new Response(),
      proxyMethod: "GET",
      req: new Request("https://app.example.com/api/request"),
    } as Context & { res: Response },
  )) as Response;
  return answer.text();
}

/** Everything the console was handed, as the console would print it. */
function printed(): string {
  return [console.error, console.warn, console.info, console.log]
    .flatMap((method) => vi.mocked(method).mock.calls.flat())
    .map((argument) => (typeof argument === "string" ? argument : inspect(argument, { depth: 8 })))
    .join("\n");
}

/* A header value the platform refuses, and repeats as it does. */
const quotesTheToken = defineMiddleware("auth", "before", (ctx) => {
  ctx.headers.set("authorization", `Bearer ${SECRET}\r\nX-Injected: 1`);
});

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubEnv("COURIER_LOG_FORMAT", undefined);
  for (const level of ["error", "warn", "info", "log", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a failure on its way to the server's log", () => {
  it("loses the token a middleware's own error quoted in the Response a direct call is answered with", async () => {
    const answer = (await executeRequest(
      sourcesWith([quotesTheToken]),
      { source: "api", method: "items" } as never,
      { res: new Response(), req: new Request("https://app.example.com/orders") } as Context & {
        res: Response;
      },
    )) as Response;
    const said = await answer.text();

    expect(answer.status).toBe(500);
    expect(said).not.toContain(SECRET);
    expect(said).toContain("is an invalid header value");
  });

  it("loses the token a middleware's own error quoted, in the log and in the answer", async () => {
    const answer = await throughProxy([quotesTheToken]);

    expect(answer).not.toContain(SECRET);
    expect(printed()).toContain("Request failed");
    expect(printed()).not.toContain(SECRET);
  });

  it("loses the credentials the system named for an upstream it could not reach", async () => {
    const refused = Object.assign(
      new Error(`getaddrinfo ENOTFOUND https://ana:${SECRET}@db.internal/?api_key=${SECRET}`),
      { code: "ENOTFOUND" },
    );
    fetchSpy.mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: refused }));

    const answer = await throughProxy([]);

    expect(answer).not.toContain(SECRET);
    expect(printed()).toContain("Upstream request failed");
    expect(printed()).not.toContain(SECRET);
  });

  it("loses the credential in the error the log middleware writes down", async () => {
    const throwing = defineMiddleware("vault", "before", () => {
      throw new Error(`vault refused password=${SECRET}`);
    });

    await throughProxy([logMiddleware(), throwing]);

    expect(printed()).toContain("api:items → ERROR");
    expect(printed()).not.toContain(SECRET);
  });

  it("loses it in a JSON line as well", async () => {
    vi.stubEnv("COURIER_LOG_FORMAT", "json");

    await throughProxy([quotesTheToken]);

    expect(printed()).toContain('"level":"error"');
    expect(printed()).not.toContain(SECRET);
  });
});
