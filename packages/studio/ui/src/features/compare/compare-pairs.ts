import { endpointKeyOf } from "@/features/explorer/endpoint-key";
import { ownRequests } from "@/features/requests/own-requests";
import { isFailedState, isStreamRequest } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types-request";

/** The ready-made pairs Compare offers. */
export type PairPreset = "failure" | "slow" | "latest";

/** Two requests to compare: A on the left, B on the right. */
export type RequestPair = readonly [a: RequestEntry, b: RequestEntry];

/**
 * The requests Compare can compare: HTTP calls that finished — not
 * streams, not calls in flight or cut short — newest first.
 *
 * @param requests - The requests Studio holds, newest first
 * @returns The candidates
 * @example
 * ```ts
 * comparable(useStudioStore.getState().requests).length; // 412
 * ```
 */
export function comparable(requests: readonly RequestEntry[]): RequestEntry[] {
  return requests.filter(
    (r) => !isStreamRequest(r) && r.status !== "pending" && r.status !== "aborted",
  );
}

/* A success and a failure the API answered: a read another call's request answered holds a copy of that answer. */
function failurePair(calls: readonly RequestEntry[]): RequestPair | null {
  const sent = ownRequests(calls);
  for (const failed of sent) {
    if (!isFailedState(failed.status)) continue;
    const key = endpointKeyOf(failed);
    const ok = sent.find((r) => r.status === "success" && endpointKeyOf(r) === key);
    if (ok) return [ok, failed];
  }
  return null;
}

/* The API's fastest and slowest: a read another call's request answered only waited, part of that request's time. */
function slowPair(calls: readonly RequestEntry[]): RequestPair | null {
  const byKey = new Map<string, RequestEntry[]>();
  for (const r of ownRequests(calls)) {
    if (r.timing === undefined) continue;
    const key = endpointKeyOf(r);
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }
  let best: RequestPair | null = null;
  let widest = 0;
  for (const list of byKey.values()) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((x, y) => (x.timing?.total ?? 0) - (y.timing?.total ?? 0));
    const fast = sorted[0];
    const slow = sorted.at(-1);
    const spread = (slow?.timing?.total ?? 0) - (fast?.timing?.total ?? 0);
    if (fast && slow && spread > widest) {
      widest = spread;
      best = [fast, slow];
    }
  }
  return best;
}

function latestPair(calls: readonly RequestEntry[]): RequestPair | null {
  const [newest, second] = calls;
  if (!newest || !second) return null;
  const key = endpointKeyOf(newest);
  const before = calls.slice(1).find((r) => endpointKeyOf(r) === key);
  return [before ?? second, newest];
}

/**
 * A ready-made pair: a success and a failure of one endpoint, the fastest
 * and slowest requests of the endpoint whose time varies most — both drawn
 * from the requests sent — or the newest call and the one before it to the
 * same endpoint.
 *
 * @param calls - The candidates, newest first
 * @param preset - Which pair
 * @returns The pair, or `null` while the traffic has none
 * @example
 * ```ts
 * pairOf(comparable(requests), "failure"); // [success, failure]
 * ```
 */
export function pairOf(calls: readonly RequestEntry[], preset: PairPreset): RequestPair | null {
  if (preset === "failure") return failurePair(calls);
  return preset === "slow" ? slowPair(calls) : latestPair(calls);
}
