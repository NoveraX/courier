import type { RequestEntry } from "@/store/types";
import type { RequestCheck } from "./request-checks";
import type { FailureStage } from "./request-failure";
import { type DeliveryStop, deliveryStopOf } from "./webhook-delivery";

/** One part of a delivery's handling — its signature, its body, its handler — and how it went. */
interface DeliveryPart {
  part: "Signature" | "Body" | "Handler";
  state: "ok" | "err" | "skip";
  /** A few words, for the Error tab's card */
  short: string;
  /** What happened, for the Overview's checks */
  title: string;
  detail: string;
  meta?: string | undefined;
}

type Delivery = Pick<RequestEntry, "error" | "statusCode" | "variables">;

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

function signaturePart(stop: DeliveryStop | undefined): DeliveryPart {
  const part = "Signature";
  if (stop === "size") {
    const detail = "The body was larger than the webhook takes";
    return { part, state: "skip", short: "not checked", title: "Signature not checked", detail };
  }
  if (stop === "secret") {
    const detail = "The webhook has no signing secret it can use";
    return { part, state: "err", short: "no secret", title: "Signature not checked", detail };
  }
  if (stop === "signature") {
    const detail = "It does not match the body under the webhook's secret";
    return { part, state: "err", short: "does not match", title: "Signature refused", detail };
  }
  const detail = "Signed by its sender with the webhook's secret";
  return { part, state: "ok", short: "matches", title: "Signature matched", detail };
}

function bodyPart(r: Delivery, stop: DeliveryStop | undefined): DeliveryPart {
  const part = "Body";
  if (stop === "size") {
    const detail = "Refused before it was read whole";
    return { part, state: "err", short: "over the limit", title: "Body too large", detail };
  }
  if (stop === "signature" || stop === "secret") {
    const detail = "Refused before it was parsed";
    return { part, state: "skip", short: "not read", title: "Body not read", detail };
  }
  if (stop === "json") {
    const detail = "It could not be parsed";
    return { part, state: "err", short: "not JSON", title: "Body is not JSON", detail };
  }
  if (stop === "schema") {
    const issues = r.error?.validationIssues ?? [];
    const count = plural(issues.length, "issue");
    const detail = issues[0] ? `${count} · ${issues[0].path || "root"}` : count;
    return { part, state: "err", short: count, title: "Body refused", detail, meta: count };
  }
  const fields =
    typeof r.variables === "object" && r.variables ? Object.keys(r.variables).length : 0;
  const meta = fields > 0 ? plural(fields, "field") : undefined;
  const detail = "Matched the webhook's schema";
  return { part, state: "ok", short: "passed", title: "Body passed the schema", detail, meta };
}

function handlerPart(r: Delivery, stop: DeliveryStop | undefined): DeliveryPart {
  const part = "Handler";
  if (stop === "handler") {
    const detail = "It threw; the sender was answered 500";
    return { part, state: "err", short: "threw", title: "Handler failed", detail };
  }
  if (stop) {
    const detail = "The delivery was refused before it";
    return { part, state: "skip", short: "not run", title: "Handler not run", detail };
  }
  if (r.error) {
    const detail = r.error.message;
    return { part, state: "err", short: "did not finish", title: "Handler did not finish", detail };
  }
  const status = r.statusCode;
  if (status === undefined) {
    const detail = "Waiting for its answer";
    return { part, state: "skip", short: "running", title: "Handler running", detail };
  }
  const detail = status === 204 ? "Answered 204, with nothing" : `Answered ${status}`;
  return status < 400
    ? { part, state: "ok", short: String(status), title: "Handler answered", detail }
    : { part, state: "err", short: String(status), title: "Handler refused it", detail };
}

function partsOf(r: Delivery): DeliveryPart[] {
  const stop = deliveryStopOf(r);
  return [signaturePart(stop), bodyPart(r, stop), handlerPart(r, stop)];
}

/**
 * The cards of the Error tab for a webhook delivery: its signature, its
 * body and its handler, each with how it went.
 *
 * @param r - The delivery
 * @returns The three stages
 * @example
 * ```ts
 * deliveryStages({ error, statusCode: 401, variables: undefined })[0]; // { label: "Signature", state: "err", meta: "does not match" }
 * ```
 */
export function deliveryStages(r: Delivery): FailureStage[] {
  return partsOf(r).map((p) => ({ label: p.part, state: p.state, meta: p.short }));
}

/**
 * The Overview's checks for a webhook delivery: what the webhook checked of
 * it — its signature, then its body — and how its handler answered.
 *
 * @param r - The delivery
 * @returns The three checks
 * @example
 * ```ts
 * deliveryChecks(delivered).map((c) => c.label); // ["Signature matched", "Body passed the schema", "Handler answered"]
 * ```
 */
export function deliveryChecks(r: Delivery): RequestCheck[] {
  return partsOf(r).map((p) => ({
    label: p.title,
    detail: p.detail,
    meta: p.meta ?? "",
    state: p.state === "skip" ? "idle" : p.state,
  }));
}
