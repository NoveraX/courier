import { isReadingMethod } from "@noverax/courier/internal";

import { endpointName } from "@/features/requests/request-parts";
import { isStreamRequest } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types-request";

/** Whether sending a request again only reads, or does again what it did. */
export type ReplayKind = "read" | "write";

/** A recorded request as a replay sends it again, or why it cannot be sent. */
export type ReplayPlan =
  | {
      readonly request: RequestEntry;
      readonly kind: ReplayKind;
      /** The call as a person reads it: `POST shop.orders.create`. */
      readonly call: string;
    }
  | { readonly refusal: string };

/** A request a replay sends again: what it was, whether it reads or writes, and its call. */
export type PlannedReplay = Exclude<ReplayPlan, { refusal: string }>;

/**
 * What a replay of a recorded request would send, and whether it reads or
 * writes — or why it cannot be sent again: Studio has no such request, a
 * webhook came to the app from its sender, a CSRF token is asked for with
 * the write that needs it, and a stream stays open rather than answering
 * once. A request that says neither its kind nor a reading verb is taken
 * for a write.
 *
 * @param requests - The requests Studio recorded
 * @param id - The id the agent gave
 * @returns The plan, or the refusal
 * @example
 * ```ts
 * const plan = replayPlan(recordedRequests(requestLog), "req_7");
 * if ("refusal" in plan) return { ok: false, message: plan.refusal };
 * ```
 */
export function replayPlan(requests: readonly RequestEntry[], id: unknown): ReplayPlan {
  const request = requests.find((r) => r.id === id);
  if (request === undefined)
    return { refusal: `Studio has no request ${String(id)}: list them with requests` };
  const refusal = refusalOf(request);
  if (refusal !== undefined) return { refusal };
  const call = `${(request.httpMethod ?? "").toUpperCase()} ${endpointName(request)}`.trim();
  return { request, kind: isRead(request) ? "read" : "write", call };
}

function refusalOf(r: RequestEntry): string | undefined {
  if (r.mode === "webhook") {
    return `${r.id} is a webhook delivery, which came to the app from its sender: deliver it again from a mock (deliverWebhook) or with the sender's own tools`;
  }
  if (r.purpose === "csrf-token") {
    return `${r.id} is the CSRF token Courier asks for before a write: it is asked for again with the write that needs it`;
  }
  if (isStreamRequest(r)) {
    return `${r.id} is a stream: reconnect it from Studio's inspector, where it stays open — a replay here waits for one answer, which a stream does not give`;
  }
  return undefined;
}

function isRead(r: RequestEntry): boolean {
  if (r.type !== undefined) return r.type === "query";
  return r.httpMethod !== undefined && isReadingMethod(r.httpMethod);
}
