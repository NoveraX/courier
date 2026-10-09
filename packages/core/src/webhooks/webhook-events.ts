import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createLogger } from "../logger";
import { studioHooks } from "../studio";

const log = createLogger("Webhook");
const encoder = new TextEncoder();

/** How long a delivery took: its checks — read, signature, body, schema — and all of it. */
export interface DeliveryTiming {
  total: number;
  middleware: number;
  fetch: number;
  validation: number;
}

/** A delivery refused, as Studio is told of it. */
export interface DeliveryRefusal {
  status: number;
  message: string;
  /** What the sender was answered */
  answer: Record<string, unknown>;
  timing: DeliveryTiming;
}

const headersOf = (headers: Headers): Record<string, string> => Object.fromEntries(headers);

/**
 * Tell Studio a delivery came: a call made to the app, marked as a webhook,
 * the event as its method and the body — once it has been checked — as its
 * variables.
 */
export function reportStart(
  id: string,
  name: string,
  request: Request,
  delivered: { event: string | undefined; body: unknown },
): void {
  const timestamp = Date.now();
  studioHooks.onRequestStart?.({
    id,
    source: name,
    group: undefined,
    method: delivered.event ?? "delivery",
    variables: delivered.body,
    mode: "webhook",
    middlewareCount: 0,
    hasValidation: { variables: true, response: false },
    httpMethod: "POST",
    timestamp,
  });
  studioHooks.onHttpFetchStart?.({ requestId: id, url: request.url, method: "POST", timestamp });
}

/** Tell Studio how the body went against the webhook's schema: passed, or the issues it refused. */
export function reportSchema(
  id: string,
  duration: number,
  issues: readonly StandardSchemaV1.Issue[] | undefined,
): void {
  const timestamp = Date.now();
  studioHooks.onValidationStart?.({ requestId: id, target: "variables", timestamp });
  if (issues) {
    studioHooks.onValidationFail?.({
      requestId: id,
      target: "variables",
      issues,
      duration,
      timestamp,
    });
  } else {
    studioHooks.onValidationPass?.({ requestId: id, target: "variables", duration, timestamp });
  }
}

/** Tell Studio a delivery was refused: what failed, what the sender was answered, what it came with. */
export function reportRefusal(id: string, request: Request, refusal: DeliveryRefusal): void {
  studioHooks.onRequestError?.({
    id,
    error: {
      type: refusal.status === 422 ? "validation" : "http",
      status: refusal.status,
      message: refusal.message,
    },
    status: refusal.status,
    requestHeaders: headersOf(request.headers),
    headers: { "content-type": "application/json" },
    data: refusal.answer,
    size: encoder.encode(JSON.stringify(refusal.answer)).length,
    timing: refusal.timing,
    timestamp: Date.now(),
  });
}

/**
 * Tell Studio how the handler answered: its status, its headers and its body.
 * The body is read from a copy, so the answer reaches the sender without
 * waiting on Studio; one without a body is told at once.
 */
export function reportAnswer(
  id: string,
  request: Request,
  response: Response,
  timing: DeliveryTiming,
): void {
  const tell = (data: unknown, size: number) =>
    studioHooks.onRequestEnd?.({
      id,
      status: response.status,
      data,
      size,
      headers: headersOf(response.headers),
      requestHeaders: headersOf(request.headers),
      timing,
      timestamp: Date.now(),
    });
  if (response.body === null || response.bodyUsed) {
    tell(undefined, 0);
    return;
  }
  readAnswer(response.clone()).then(
    (body) => tell(body.data, body.size),
    (error: unknown) => {
      log.warn("Could not read a webhook handler's answer for Studio", error);
      tell(undefined, 0);
    },
  );
}

async function readAnswer(copy: Response): Promise<{ data: unknown; size: number }> {
  const bytes = new Uint8Array(await copy.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  if (text === "") return { data: undefined, size: 0 };
  const json = copy.headers.get("content-type")?.includes("json") ?? false;
  if (!json) return { data: text, size: bytes.length };
  try {
    return { data: JSON.parse(text), size: bytes.length };
  } catch {
    /* Declared JSON that is not: shown as the text it is. */
    return { data: text, size: bytes.length };
  }
}
