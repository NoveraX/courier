/**
 * The order a call's middleware runs in: one after another, never at once.
 * The API's own run first, then the endpoint's `.retry()` policy, then the
 * base's and the endpoint's `.use()` in the order they were named. A
 * `before` handler runs on the way in, an `after` handler on the way out,
 * innermost first, and a `wrap` handler around the rest of the chain; a
 * retry runs again only what lies inside it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { defineMiddleware } from "../../src/middleware/index";
import type { Middleware } from "../../src/middleware/types";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

function tracing(log: string[], name: string, held?: Promise<void>): Middleware[] {
  return [
    defineMiddleware(`${name}-before`, "before", async () => {
      log.push(`${name} before: start`);
      await held;
      log.push(`${name} before: end`);
    }),
    defineMiddleware(`${name}-after`, "after", (_ctx, response) => {
      log.push(`${name} after`);
      return response;
    }),
  ];
}

describe("the order a call's middleware runs in", () => {
  it("runs the API's, then each .use() in turn, each waiting for the one before", async () => {
    const log: string[] = [];
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    upstream = await startUpstream((_req, res) => {
      log.push("upstream");
      sendJson(res, 200, { ok: true });
    });
    const wrap = defineMiddleware("wrap", "wrap", async (_ctx, next) => {
      log.push("wrap: in");
      const response = await next();
      log.push("wrap: out");
      return response;
    });
    const { endpoint } = courier({ middleware: tracing(log, "base") });
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: tracing(log, "api", held),
        endpoints: {
          read: endpoint
            .get("read")
            .use(...tracing(log, "first"))
            .use(wrap)
            .use(...tracing(log, "third")),
        },
      }),
    );

    const call = client.read();
    /* While the API's before waits, nothing after it has started — not even after a turn of the loop. */
    await vi.waitFor(() => expect(log).toEqual(["api before: start"]));
    await new Promise((resolve) => setImmediate(resolve));
    expect(log).toEqual(["api before: start"]);
    release();

    await expect(call).resolves.toEqual({ ok: true });
    expect(log).toEqual([
      "api before: start",
      "api before: end",
      "base before: start",
      "base before: end",
      "first before: start",
      "first before: end",
      "wrap: in",
      "third before: start",
      "third before: end",
      "upstream",
      "third after",
      "wrap: out",
      "first after",
      "base after",
      "api after",
    ]);
  });

  it("runs an endpoint's .retry() inside the API's middleware and around its own", async () => {
    const log: string[] = [];
    upstream = await startUpstream((_req, res, index) => {
      log.push(`upstream ${index}`);
      sendJson(res, index === 0 ? 503 : 200, { ok: index > 0 });
    });
    const counting = (name: string): Middleware =>
      defineMiddleware(name, "before", () => {
        log.push(name);
      });
    const { endpoint } = courier();
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: [counting("api")],
        endpoints: {
          read: endpoint.get("read").retry({ limit: 1, delay: 1 }).use(counting("own")),
        },
      }),
    );

    await expect(client.read()).resolves.toEqual({ ok: true });

    expect(log).toEqual(["api", "own", "upstream 0", "own", "upstream 1"]);
  });
});
