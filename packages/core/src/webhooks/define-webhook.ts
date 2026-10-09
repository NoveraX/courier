import type { StandardSchemaV1 } from "@standard-schema/spec";

import { discardBody } from "../adapter/discard-body";
import { readBoundedBody } from "../adapter/read-body";
import { ConfigurationError } from "../errors/configuration-error";
import { createLogger } from "../logger";
import type { WebhookDelivery, WebhookSignature } from "./types";
import { type WebhookStudio, webhookStudio } from "./webhook-studio";

const log = createLogger("Webhook");

/* Providers send kilobytes; a larger body is refused at the chunk that crosses this, not after it is held whole. */
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const decoder = new TextDecoder();

/** What a webhook is declared with. */
export interface WebhookOptions<TBody> {
  /** Its name, which Studio's Timeline shows it by: `stripe` */
  name: string;
  /** How its sender signs a delivery: `stripeSignature(…)`, `githubSignature(…)`, … */
  signature: WebhookSignature;
  /** The schema each delivery's body must pass */
  body: StandardSchemaV1<unknown, TBody>;
  /** The event a body is, for the Timeline and for your handler: `(body) => body.type` */
  event?: ((body: TBody) => string | undefined) | undefined;
  /** The largest body taken (default: 1 MB) */
  maxBodyBytes?: number | undefined;
}

/** A declared webhook: what handles its deliveries, and what signs one for a test. */
export interface Webhook<TBody> {
  readonly name: string;
  readonly scheme: string;
  /**
   * The function a route mounts: a delivery in, the answer out. A delivery
   * whose signature does not match is refused with 401, a body that is not
   * JSON with 400, one the schema refuses with 422 — before `onEvent` runs.
   * `onEvent` answering nothing answers 204; a `Response` it returns is
   * answered as it is; one that throws is answered 500, which the sender
   * retries.
   */
  handler(
    onEvent: (body: TBody, delivery: WebhookDelivery) => unknown,
  ): (request: Request) => Promise<Response>;
  /**
   * The headers that sign a body as the sender would, with the webhook's
   * own secret — for a mock or a test that delivers one.
   */
  sign(raw: string, now?: number): Promise<Record<string, string>>;
}

/**
 * Declare an incoming webhook as an endpoint is declared: the schema its
 * body must pass, and the signature its sender signs with — checked over
 * the body exactly as it came, in time that leaks nothing, before anything
 * is parsed. A delivery shows in Studio's Timeline like a call, marked as
 * a webhook, with the event it was and how it was answered.
 *
 * @param options - Its name, its signature, its body's schema and how to read its event
 * @returns The webhook
 * @throws {ConfigurationError} `WEBHOOK_OPTIONS_INVALID` when a name, a signature or a schema is missing
 * @example
 * ```ts
 * const stripe = defineWebhook({
 *   name: "stripe",
 *   signature: stripeSignature({ secret: () => process.env.STRIPE_WEBHOOK_SECRET }),
 *   body: z.object({ id: z.string(), type: z.string(), data: z.object({ object: z.unknown() }) }),
 *   event: (body) => body.type,
 * });
 * export const POST = stripe.handler(async (event) => {
 *   if (event.type === "invoice.paid") await markPaid(event.data.object);
 * });
 * ```
 */
export function defineWebhook<TBody>(options: WebhookOptions<TBody>): Webhook<TBody> {
  if (!options.name || !options.signature || !options.body) {
    throw new ConfigurationError(
      "WEBHOOK_OPTIONS_INVALID",
      "[courier] a webhook needs a name, a signature its sender signs with, and a schema for its body",
    );
  }
  const limit = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  return {
    name: options.name,
    scheme: options.signature.scheme,
    handler: (onEvent) => async (request) => {
      const studio = webhookStudio(options.name, request);
      const raw = await readSigned(request, options, limit, studio);
      if (raw instanceof Response) return raw;
      const body = await parseBody(raw, options.body, studio);
      if (body instanceof Response) return body;
      const event = eventOf(options, body.value);
      studio.start(event, body.value);
      studio.checked();
      return studio.answer(() => onEvent(body.value, { request, event }));
    },
    sign: (raw, now = Date.now()) => options.signature.sign(raw, now),
  };
}

async function readSigned<TBody>(
  request: Request,
  options: WebhookOptions<TBody>,
  limit: number,
  studio: WebhookStudio,
): Promise<string | Response> {
  const body = await readBoundedBody(request, limit);
  if (!body.ok) {
    discardBody(request);
    return studio.refuse(413, "The delivery is larger than this webhook takes");
  }
  const raw = decoder.decode(body.bytes);
  try {
    const verified = await options.signature.verify(raw, request.headers, Date.now());
    return verified ? raw : studio.refuse(401, "The delivery's signature does not match");
  } catch (error) {
    log.error(`The ${options.name} webhook could not check a delivery's signature`, error);
    return studio.refuse(500, "The webhook could not check the delivery's signature");
  }
}

async function parseBody<TBody>(
  raw: string,
  schema: StandardSchemaV1<unknown, TBody>,
  studio: WebhookStudio,
): Promise<{ value: TBody } | Response> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return studio.refuse(400, "The delivery's body is not JSON");
  }
  const result = await schema["~standard"].validate(parsed);
  if (!result.issues) return { value: result.value };
  /* Its sender signed it, so the refused body shows in Studio: it is what the schema did not take. */
  studio.start(undefined, parsed);
  studio.checked(result.issues);
  return studio.refuse(
    422,
    "The delivery's body does not pass the webhook's schema",
    result.issues,
  );
}

/* The event only names the delivery, so a reader that throws leaves it unnamed rather than refused. */
function eventOf<TBody>(options: WebhookOptions<TBody>, body: TBody): string | undefined {
  try {
    return options.event?.(body);
  } catch (error) {
    log.warn(`The ${options.name} webhook could not read a delivery's event`, error);
    return undefined;
  }
}
