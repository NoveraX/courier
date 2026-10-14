/** The body a Courier proxy answers a call it refuses with. */
export interface ProxyFailure {
  success: false;
  message: string;
}

/**
 * The body a mock's proxy routes refuse a call with: the one a Courier
 * proxy answers its own refusals with, so a page that reads `message` off
 * a refusal reads it from the mock as from the proxy.
 *
 * @param message - Why the call was refused
 * @returns The body
 * @example
 * ```ts
 * c.json(proxyFailure("[api][shop][audit]: method not found"), 400);
 * ```
 */
export function proxyFailure(message: string): ProxyFailure {
  return { success: false, message };
}
