import { formatDuration } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";

/**
 * Where a webhook delivery stopped short of an answer from its handler: its
 * body over the limit, a signature that does not match, no secret to check
 * one with, a body that is not JSON, one the schema refused — or the
 * handler itself, which threw.
 */
export type DeliveryStop = "size" | "signature" | "secret" | "json" | "schema" | "handler";

/** The parts of a delivery the Error tab lays out, in the order they ran. */
export interface DeliveryFailure {
  where: string;
  hint: string;
}

/* Each refusal answers with its own status: the contract `defineWebhook` keeps, and its docs list. */
const REFUSED_WITH: ReadonlyMap<number, DeliveryStop> = new Map([
  [413, "size"],
  [401, "signature"],
  [400, "json"],
  [422, "schema"],
]);

/**
 * Where a webhook delivery stopped, told from how it was refused: a refusal
 * answers with its own status, and a delivery carries its body only once
 * it has been read and signed — so a `500` without one never reached the
 * handler, and one with it is the handler's own failure.
 *
 * @param r - The delivery, as the Timeline keeps it
 * @returns Where it stopped, or `undefined` when it was handled or is not known to have failed
 * @example
 * ```ts
 * deliveryStopOf({ error: { type: "http", message: "…" }, statusCode: 401, variables: undefined }); // "signature"
 * ```
 */
export function deliveryStopOf(
  r: Pick<RequestEntry, "error" | "statusCode" | "variables">,
): DeliveryStop | undefined {
  if (!r.error) return undefined;
  const status = r.statusCode ?? r.error.status;
  if (status === undefined) return undefined;
  const refused = REFUSED_WITH.get(status);
  if (refused) return refused;
  if (status !== 500) return undefined;
  return r.variables === undefined ? "secret" : "handler";
}

const FAILURES: Readonly<Record<Exclude<DeliveryStop, "handler">, DeliveryFailure>> = {
  size: {
    where: "Refused before it was read whole: it is larger than the webhook takes",
    hint: "The sender's delivery is larger than the webhook takes. If the sender's events are this large, raise `maxBodyBytes` where the webhook is declared.",
  },
  signature: {
    where: "Refused before your handler ran: the signature does not match the body",
    hint: "The webhook's secret is not the one its sender signs with, or the body changed on its way. Copy the signing secret from the sender's dashboard, and mount the handler where no framework reads the body before it.",
  },
  secret: {
    where: "Refused before your handler ran: the webhook could not check the signature",
    hint: "The webhook has no signing secret it can use — none is set or, for Standard Webhooks, it is not `whsec_` and base64. Set the secret its sender signs with; the app's log says what is missing.",
  },
  json: {
    where: "Refused before your handler ran: the body is not JSON",
    hint: "The sender did not send JSON. Check what its webhook settings deliver.",
  },
  schema: {
    where: "Refused before your handler ran: the body broke the webhook's schema",
    hint: "The sender sent an event the schema does not take. Compare the schema with the sender's reference for this event; a field it sends only sometimes is optional.",
  },
};

/**
 * What the Error tab says of a delivery that stopped: where, and what
 * usually fixes it.
 *
 * @param stop - Where it stopped
 * @param ms - How long it ran, when known
 * @returns The line that says where, and the advice
 * @example
 * ```ts
 * deliveryFailureOf("handler", 12).where; // "Your handler failed after 12ms"
 * ```
 */
export function deliveryFailureOf(stop: DeliveryStop, ms: number | undefined): DeliveryFailure {
  if (stop !== "handler") return FAILURES[stop];
  return {
    where: `Your handler failed${ms === undefined ? "" : ` after ${formatDuration(ms)}`}`,
    hint: "Your handler threw; the app's log has its error. The sender delivers again an event answered 500, so let the handler run twice safely: keep the ids of the events it has handled.",
  };
}
