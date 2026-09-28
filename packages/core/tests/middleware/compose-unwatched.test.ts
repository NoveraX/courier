/**
 * The middleware chain while Studio is not attached, as in production.
 *
 * Every request snapshotted and diffed the headers around each middleware
 * and read the clock several times per middleware, for Studio's timeline,
 * whether or not a Studio was there to be told.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { composeMiddleware, defineMiddleware } from "../../src/middleware";
import type { MiddlewareContext, MiddlewareResponse } from "../../src/middleware/types";
import { studioHooks } from "../../src/studio";

const order: string[] = [];
const stamp = defineMiddleware("stamp", "before", (ctx) => {
  order.push("before");
  ctx.headers.set("x-stamp", "yes");
});
const around = defineMiddleware("around", "wrap", async (_ctx, next) => {
  order.push("wrap in");
  const response = await next();
  order.push("wrap out");
  return response;
});
const mark = defineMiddleware("mark", "after", (_ctx, response) => {
  order.push("after");
  return { ...response, data: `${String(response.data)}!` };
});

function context(): MiddlewareContext {
  return { source: "api", method: "list", headers: new Headers() };
}

function answer(ctx: MiddlewareContext): Promise<MiddlewareResponse> {
  order.push("fetch");
  return Promise.resolve({ status: 200, data: ctx.headers.get("x-stamp"), headers: new Headers() });
}

afterEach(() => {
  order.length = 0;
  studioHooks.onMiddlewareExit = undefined;
  vi.restoreAllMocks();
});

describe("a chain nobody watches", () => {
  it("runs each phase in order and reads no clock", async () => {
    const now = vi.spyOn(performance, "now");
    const ctx = context();

    const response = await composeMiddleware([stamp, around, mark])(ctx, () => answer(ctx));

    expect(response.data).toBe("yes!");
    expect(order).toEqual(["before", "wrap in", "fetch", "after", "wrap out"]);
    expect(now).not.toHaveBeenCalled();
  });

  it("is timed again once Studio attaches", async () => {
    const exits: string[] = [];
    studioHooks.onMiddlewareExit = (event) => void exits.push(event.name);
    const ctx = context();

    await composeMiddleware([stamp, around, mark])(ctx, () => answer(ctx));

    expect(exits.sort()).toEqual(["around", "mark", "stamp"]);
  });
});
