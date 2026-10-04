/**
 * What Studio is told about each middleware of a request that failed.
 *
 * Only the middleware that threw reports the error; the ones the failure
 * passes back through report that they exited. A request the upstream
 * answers with an error status reports no middleware as failed, since none
 * of them did.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define/index";
import { defineMiddleware } from "../../src/middleware";
import { studioHooks } from "../../src/studio";
import type { StudioHooks } from "../../src/studio/hooks";

const { endpoint } = courier();

let upstream: Server;
let saved: StudioHooks;
const failed = vi.fn();
const exited = vi.fn();

const stamp = defineMiddleware("stamp-header", "before", async (ctx) => {
  ctx.headers.set("x-stamp", "yes");
});
const timing = defineMiddleware("timing-after", "after", async (_ctx, response) => response);
const boom = defineMiddleware("boom-mw", "before", async () => {
  throw new Error("middleware exploded");
});

interface Client {
  missing: () => Promise<unknown>;
  exploding: () => Promise<unknown>;
}

async function client(): Promise<Client> {
  upstream = createServer((req, res) => {
    res.statusCode = req.url === "/missing" ? 404 : 200;
    res.end("{}");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const api = defineApi({
    baseURL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    middleware: [stamp, timing],
    endpoints: {
      missing: endpoint.get("missing").response<unknown>(),
      exploding: endpoint.get("echo").use(boom).response<unknown>(),
    },
  });
  return createCaller(api) as unknown as Client;
}

const names = (spy: typeof failed) => spy.mock.calls.map(([event]) => event.name);

beforeEach(() => {
  saved = { ...studioHooks };
  studioHooks.onRequestStart = () => {};
  studioHooks.onMiddlewareError = failed;
  studioHooks.onMiddlewareExit = exited;
});

afterEach(async () => {
  for (const key of Object.keys(studioHooks) as Array<keyof StudioHooks>) delete studioHooks[key];
  Object.assign(studioHooks, saved);
  failed.mockReset();
  exited.mockReset();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe("a request whose middleware throws", () => {
  it("reports the error for the middleware that threw it only", async () => {
    await (await client()).exploding().catch(() => {});

    expect(names(failed)).toEqual(["boom-mw"]);
    expect(failed.mock.calls[0]?.[0].error).toBe("middleware exploded");
  });

  it("reports the middleware the failure passed back through as exited", async () => {
    await (await client()).exploding().catch(() => {});

    expect(names(exited)).toEqual(["timing-after", "stamp-header"]);
  });
});

describe("a request the upstream answers with an error status", () => {
  it("reports no middleware as failed", async () => {
    await (await client()).missing().catch(() => {});

    expect(failed).not.toHaveBeenCalled();
    expect(names(exited)).toEqual(["timing-after", "stamp-header"]);
  });
});
