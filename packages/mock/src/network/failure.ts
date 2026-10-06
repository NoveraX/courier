import type { FaultType, FaultWeight, NetworkConfig } from "../types";
import { isErrorStatus, reasonPhrase, statusHeaders } from "./http-statuses";

/* A timeout fault holds its request until it times out, so an error rate
   alone never picks one: it fails requests, it does not stall them. */
const DEFAULT_FAULT_TYPES = ["500", "503"] as const;

const CONNECTION_FAULTS: ReadonlySet<string> = new Set(["timeout", "reset", "interrupt"]);
const STATUS = /^\d{3}$/;

/**
 * Whether a value names a fault the mock simulates: an error status from
 * 400 to 599, `timeout`, `reset` or `interrupt`.
 *
 * @param value - The value, as Studio or a config gives it
 * @returns Whether it is one
 * @example
 * ```ts
 * isFaultType("413"); // true
 * isFaultType("302"); // false
 * ```
 */
export function isFaultType(value: string): value is FaultType {
  return CONNECTION_FAULTS.has(value) || (STATUS.test(value) && isErrorStatus(Number(value)));
}

/** Decide if this request should fail based on error rate */
export function shouldFail(config: NetworkConfig): boolean {
  if (!config.errorRate || config.errorRate <= 0) return false;
  return Math.random() < config.errorRate;
}

/** Pick a fault type — uses weighted distribution when faultWeights is set */
export function pickFault(config: NetworkConfig): string {
  if (config.faultWeights?.length) {
    return pickWeightedFault(config.faultWeights);
  }
  const faults = config.faultTypes ?? [...DEFAULT_FAULT_TYPES];
  return faults[Math.floor(Math.random() * faults.length)] ?? "500";
}

/** Weighted random selection — weights don't need to sum to 100 */
function pickWeightedFault(weights: FaultWeight[]): string {
  const active = weights.filter((w) => w.weight > 0);
  if (active.length === 0) return "500";

  const totalWeight = active.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of active) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  const last = active[active.length - 1];
  return last ? last.type : "500";
}

/** How an injected fault fails a request: its status, the message its `{ error }` body says, and its headers */
export interface FaultError {
  status: number;
  message: string;
  headers: Record<string, string>;
}

/**
 * How a fault fails a request. A status is answered with itself — one that
 * is no error status with a 500 — its message naming it and its reason
 * (`HTTP 413 Content Too Large (simulated)`), with the headers a server
 * sends with it: a challenge with a 401, `Retry-After` with a 429 or 503.
 * A timeout is a 408; a connection reset, or an upload cut off, a 502 —
 * the status recorded for a request that got no answer.
 *
 * @param fault - The fault: a status, `timeout`, `reset` or `interrupt`
 * @returns Its status, message and headers
 * @example
 * ```ts
 * createFaultError("429");
 * // { status: 429, message: "HTTP 429 Too Many Requests (simulated)", headers: { "Retry-After": "5" } }
 * ```
 */
export function createFaultError(fault: string): FaultError {
  switch (fault) {
    case "timeout":
      return { status: 408, message: "Request Timeout (simulated)", headers: {} };
    case "reset":
      return { status: 502, message: "Connection Reset (simulated)", headers: {} };
    case "interrupt":
      return { status: 502, message: "Upload Interrupted (simulated)", headers: {} };
    default:
      return statusFault(Number(fault));
  }
}

function statusFault(asked: number): FaultError {
  const status = isErrorStatus(asked) ? asked : 500;
  const reason = reasonPhrase(status);
  return {
    status,
    message: `HTTP ${status}${reason ? ` ${reason}` : ""} (simulated)`,
    headers: statusHeaders(status),
  };
}
