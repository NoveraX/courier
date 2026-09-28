import { studioHooks } from "../studio";
import { runAfter, runBefore, runWrap } from "./phase-runners";
import { emitExit, propagateInner } from "./studio-tracking";
import type { Middleware, MiddlewareContext, MiddlewareResponse, NextFn } from "./types";

export function composeMiddleware(
  middlewares: Middleware[],
): (ctx: MiddlewareContext, next: NextFn) => Promise<MiddlewareResponse> {
  if (middlewares.length === 0) return (_ctx, next) => next();

  const dt = studioHooks;
  const totalCount = middlewares.length;

  return (ctx, next) => {
    /* Without Studio nothing reads the timings or the headers each middleware
       added, so a request pays for none of them. Asked per request: Studio
       may attach after the chain was composed. */
    if (!dt.onMiddlewareEnter && !dt.onMiddlewareExit && !dt.onMiddlewareError) {
      return runPlain(middlewares, 0, ctx, next);
    }
    const innerTime: number[] = new Array(totalCount).fill(0);

    function trackTail(idx: number, p: Promise<MiddlewareResponse>): Promise<MiddlewareResponse> {
      if (!dt.onMiddlewareExit || idx < 1) return p;
      const nt0 = performance.now();
      return p.then(
        (r) => {
          innerTime[idx - 1] = (innerTime[idx - 1] ?? 0) + (performance.now() - nt0);
          return r;
        },
        (e: unknown) => {
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
      /* A failure from further down the chain that this middleware only
         passes back is not its own: it exits, and the one that threw reports it. */
      let passedBack: { error: unknown } | undefined;
      const chainNext = (): Promise<MiddlewareResponse> =>
        dispatch(i + 1).catch((error: unknown) => {
          passedBack = { error };
          throw error;
        });

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
        (error: unknown) => {
          if (passedBack?.error === error) {
            emitExit(rid, mw, i, t0, innerTime, [], 0, 0);
            throw error;
          }
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

/* The chain as it runs with nobody watching: each phase and nothing else. */
async function runPlain(
  middlewares: readonly Middleware[],
  index: number,
  ctx: MiddlewareContext,
  next: NextFn,
): Promise<MiddlewareResponse> {
  const mw = middlewares[index];
  if (!mw) return next();
  const chainNext = (): Promise<MiddlewareResponse> => runPlain(middlewares, index + 1, ctx, next);
  if (mw.phase === "before") {
    await mw.handler(ctx);
    return chainNext();
  }
  if (mw.phase === "after") return mw.handler(ctx, await chainNext());
  return mw.handler(ctx, chainNext);
}
