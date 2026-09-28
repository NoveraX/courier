import type { RequestPayload } from "../utils/request-payload";

/**
 * Runs a proxied call once its entry point has read it.
 *
 * `requestId` is the id Studio was told the call arrived under, so the call
 * carries on under it rather than starting another.
 */
export type ExecuteFn = (
  request: Request,
  payload: Partial<RequestPayload>,
  proxyMethod: "GET" | "POST",
  proxyReceiveAt: number,
  requestId: string | undefined,
) => Promise<Response>;
