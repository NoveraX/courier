import type { ProxyTiming } from "../types";
import { readNumbers } from "./read-numbers";

const KEYS = ["clientToProxy", "proxyToBackend", "backendToProxy", "proxyToClient"] as const;

/**
 * A proxied request's four legs from a socket event, or `undefined`.
 *
 * @param value - The field as the socket parsed it
 * @returns The timing, or `undefined` when a leg is missing
 * @example
 * ```ts
 * readProxyTiming({ clientToProxy: 2, proxyToBackend: 1, backendToProxy: 5, proxyToClient: 1 });
 * ```
 */
export function readProxyTiming(value: unknown): ProxyTiming | undefined {
  return readNumbers(value, KEYS);
}
