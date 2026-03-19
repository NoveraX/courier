import { devtoolsHooks } from "../devtools";
import type {
  AfterHandler,
  BeforeHandler,
  Middleware,
  MiddlewareContext,
  MiddlewarePhase,
  MiddlewareResponse,
  NextFn,
  WrapHandler,
} from "./types";

// ── defineMiddleware ───────────────────────────────────────────────────────

/**
 * Define a typed middleware with explicit phase.
 *
 * @param name - Middleware name shown in DevTools
 * @param phase - "before" (pre-fetch), "after" (post-fetch), "wrap" (both)
 * @param handler - Phase-specific handler function
 *
 * @example
 * const auth = defineMiddleware("auth", "before", async (ctx) => {
 *   ctx.headers.set("Authorization", `Bearer ${token}`);
 * });
 *
 * @example
 * const logger = defineMiddleware("logger", "wrap", async (ctx, next) => {
 *   const t0 = Date.now();
 *   const res = await next();
 *   console.log(`${ctx.method} took ${Date.now() - t0}ms`);
 *   return res;
 * });
 */
export function defineMiddleware(name: string, phase: "before", handler: BeforeHandler): Middleware;
export function defineMiddleware(name: string, phase: "after", handler: AfterHandler): Middleware;
export function defineMiddleware(name: string, phase: "wrap", handler: WrapHandler): Middleware;
export function defineMiddleware(
  name: string,
  phase: MiddlewarePhase,
  handler: BeforeHandler | AfterHandler | WrapHandler,
): Middleware {
  return { name, phase, handler } as Middleware;
}

// ── composeMiddleware ──────────────────────────────────────────────────────

export function composeMiddleware(
  middlewares: Middleware[],
): (ctx: MiddlewareContext, next: NextFn) => Promise<MiddlewareResponse> {
  if (middlewares.length === 0) return (_ctx, next) => next();

  const dt = devtoolsHooks;
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

// ── Phase result ───────────────────────────────────────────────────────────

interface PhaseResult {
  response: MiddlewareResponse;
  headersAdded: string[];
  beforeTime: number;
  afterTime: number;
}

// ── Phase runners (capture headers + timing per phase) ─────────────────────

async function runBefore(
  handler: BeforeHandler,
  ctx: MiddlewareContext,
  next: NextFn,
): Promise<PhaseResult> {
  const snap = snapshotHeaders(ctx.headers);
  const bt0 = performance.now();
  await handler(ctx);
  const beforeTime = performance.now() - bt0;
  const headersAdded = diffHeaders(snap, ctx.headers);
  const response = await next();
  return { response, headersAdded, beforeTime, afterTime: 0 };
}

async function runAfter(
  handler: AfterHandler,
  ctx: MiddlewareContext,
  next: NextFn,
): Promise<PhaseResult> {
  const response = await next();
  const snap = snapshotHeaders(ctx.headers);
  const at0 = performance.now();
  const result = await handler(ctx, response);
  const afterTime = performance.now() - at0;
  const headersAdded = diffHeaders(snap, ctx.headers);
  return { response: result, headersAdded, beforeTime: 0, afterTime };
}

async function runWrap(
  handler: WrapHandler,
  ctx: MiddlewareContext,
  chainNext: NextFn,
): Promise<PhaseResult> {
  const snap = snapshotHeaders(ctx.headers);
  let preNextTime = 0;

  const wrappedNext = (): Promise<MiddlewareResponse> => {
    preNextTime = performance.now();
    return chainNext();
  };

  const bt0 = performance.now();
  const response = await handler(ctx, wrappedNext);
  const totalTime = performance.now() - bt0;

  // Headers added = diff between snapshot and current (includes inner, best effort for wrap)
  const headersAdded = diffHeaders(snap, ctx.headers);

  // Before time = handler start → next() call, After time = next() return → handler return
  const beforeTime = preNextTime > 0 ? preNextTime - bt0 : totalTime;
  const afterTime = preNextTime > 0 ? totalTime - (preNextTime - bt0) : 0;

  return { response, headersAdded, beforeTime, afterTime };
}

// ── DevTools helpers ───────────────────────────────────────────────────────

function emitExit(
  rid: string,
  mw: Middleware,
  i: number,
  t0: number,
  innerTime: number[],
  headersAdded: string[],
  rawBeforeTime: number,
  rawAfterTime: number,
): void {
  const dt = devtoolsHooks;
  if (!dt.onMiddlewareExit) return;

  const wallTime = performance.now() - t0;
  const inner = innerTime[i] ?? 0;
  const selfTime = wallTime - inner;
  if (i > 0) innerTime[i - 1] = (innerTime[i - 1] ?? 0) + wallTime;

  // For wrap, rawAfterTime includes inner chain — correct to self-time only
  const beforeDuration = rawBeforeTime;
  const afterDuration = mw.phase === "wrap" ? Math.max(0, selfTime - rawBeforeTime) : rawAfterTime;

  dt.onMiddlewareExit?.({
    requestId: rid,
    name: mw.name,
    index: i,
    duration: selfTime,
    phase: mw.phase,
    beforeDuration,
    afterDuration,
    headersAdded,
    timestamp: Date.now(),
  });
}

function propagateInner(i: number, t0: number, innerTime: number[]): void {
  const wallTime = performance.now() - t0;
  if (i > 0) innerTime[i - 1] = (innerTime[i - 1] ?? 0) + wallTime;
}

// ── Header tracking ────────────────────────────────────────────────────────

function snapshotHeaders(headers: Headers): Set<string> {
  const keys = new Set<string>();
  for (const [k] of headers) keys.add(k.toLowerCase());
  return keys;
}

function diffHeaders(before: Set<string>, headers: Headers): string[] {
  const added: string[] = [];
  for (const [k] of headers) {
    if (!before.has(k.toLowerCase())) added.push(k);
  }
  return added;
}
