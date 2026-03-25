import { studioHooks } from "../studio";
import { runAfter, runBefore, runWrap } from "./phase-runners";
import { emitExit, propagateInner } from "./studio-tracking";
import type { Middleware, MiddlewareContext, MiddlewareResponse, NextFn } from "./types";

// Re-export defineMiddleware so existing imports from "./middleware/compose" keep working
export { defineMiddleware } from "./define";

export function composeMiddleware(
  middlewares: Middleware[],
): (ctx: MiddlewareContext, next: NextFn) => Promise<MiddlewareResponse> {
  if (middlewares.length === 0) return (_ctx, next) => next();

  const dt = studioHooks;
  const totalCount = middlewares.length;

  return (ctx, next) => {
    const innerTime: number[] = new Array(totalCount).fill(0);

    function trackTail(idx: number, p: Promise<MiddlewareResponse>): Promise<MiddlewareResponse> {
      if (!dt.onMiddlewareExit || idx < 1) return p;
      const nt0 = performance.now();
      return p.then(
        (r) => {
          innerTime[idx - 1] = (innerTime[idx - 1] ?? 0) + (performance.now() - nt0);
          return r;
        },
        (e) => {
          innerTime[idx - 1] = (innerTime[idx - 1] ?? 0) + (performance.now() - nt0);
          throw e;
        },
      );
    }

    function dispatch(i: number): Promise<MiddlewareResponse> {
      const mw = middlewares[i];
      if (!mw) return trackTail(i, next());

      const rid = ctx._requestId ?? `${ctx.source}:${ctx.group ?? ""}:${ctx.method}`;
      dt.onMiddlewareEnter?.({
        requestId: rid,
        name: mw.name,
        index: i,
        totalCount,
        phase: mw.phase,
        timestamp: Date.now(),
      });

      const t0 = dt.onMiddlewareExit ? performance.now() : 0;
      const chainNext = (): Promise<MiddlewareResponse> => dispatch(i + 1);

      const promise =
        mw.phase === "before"
          ? runBefore(mw.handler, ctx, chainNext)
          : mw.phase === "after"
            ? runAfter(mw.handler, ctx, chainNext)
            : runWrap(mw.handler, ctx, chainNext);

      return promise.then(
        ({ response, headersAdded, beforeTime, afterTime }) => {
          emitExit(rid, mw, i, t0, innerTime, headersAdded, beforeTime, afterTime);
          return response;
        },
        (error) => {
          propagateInner(i, t0, innerTime);
          dt.onMiddlewareError?.({
            requestId: rid,
            name: mw.name,
            index: i,
            phase: mw.phase,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          });
          throw error;
        },
      );
    }

    return dispatch(0);
  };
}
