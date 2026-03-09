/** Context available to middleware functions */
export type MiddlewareContext = {
  /** Source name (e.g., "api") */
  source: string;
  /** Group name (e.g., "users") */
  group?: string;
  /** Endpoint method name (e.g., "getAll") */
  method: string;
  /** Request variables (body/params) — can be modified by middleware */
  variables?: unknown;
  /** Request headers — can be modified by middleware */
  headers: Headers;
};

/** Response returned from the middleware chain / endpoint execution */
export type MiddlewareResponse = {
  status: number;
  data: unknown;
  headers: Headers;
};

/** Calls the next middleware in the chain, or the endpoint handler */
export type NextFn = () => Promise<MiddlewareResponse>;

/** Middleware function — wraps around the next middleware / endpoint handler */
export type MiddlewareFn = (ctx: MiddlewareContext, next: NextFn) => Promise<MiddlewareResponse>;
