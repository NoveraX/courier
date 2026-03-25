import { diffHeaders, snapshotHeaders } from "./studio-tracking";
import type {
  AfterHandler,
  BeforeHandler,
  MiddlewareContext,
  MiddlewareResponse,
  NextFn,
  WrapHandler,
} from "./types";

export interface PhaseResult {
  response: MiddlewareResponse;
  headersAdded: string[];
  beforeTime: number;
  afterTime: number;
}

export async function runBefore(
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

export async function runAfter(
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

export async function runWrap(
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

  // Before time = handler start -> next() call, After time = next() return -> handler return
  const beforeTime = preNextTime > 0 ? preNextTime - bt0 : totalTime;
  const afterTime = preNextTime > 0 ? totalTime - (preNextTime - bt0) : 0;

  return { response, headersAdded, beforeTime, afterTime };
}
