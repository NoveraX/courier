import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { TopicKeyReader } from "../../define/options";
import type { Sources } from "../../define/types";
import { checkResponse } from "../../realtime/check-response";
import type { SSEEvent } from "../../realtime/types";
import { resolveEndpoint } from "../../utils/execute-resolve";
import { validateSchema } from "../../validation";

/**
 * Sentinel URL used for the synthetic Request passed to middleware.
 *
 * `.invalid` is an RFC 2606 reserved TLD that is guaranteed never to resolve
 * via DNS — the Request is created in memory only (for `request.headers`
 * access by middleware) and is never dispatched to the network.
 */
export const SYNTHETIC_URL = "http://in-process.invalid/";

/** Build a synthetic Request that only carries headers into middleware. */
export function buildSyntheticRequest(headers: Record<string, string> | undefined): Request {
  return new Request(SYNTHETIC_URL, { method: "GET", headers: headers ?? {} });
}

/** Materialize a Headers object into a plain record (preserves last value per key). */
export function headersToRecord(h: Headers): Record<string, string> {
  const rec: Record<string, string> = {};
  h.forEach((v, k) => {
    rec[k] = v;
  });
  return rec;
}

/** Schema slice exposed to in-process executors (only the fields they touch). */
export interface InProcessStreamSchema {
  variables?: unknown;
  response?: StandardSchemaV1;
  receive?: unknown;
  transport?: string;
}

/** Identifies a stream endpoint inside a Sources map. */
export interface StreamEndpointLocator {
  source: string;
  group?: string | undefined;
  method: string;
}

/** Result of `resolveStreamEndpoint`. */
export interface ResolvedStreamEndpoint {
  endpoint: unknown;
  schema: InProcessStreamSchema;
  /** What a channel's subscribers share a topic by, from its `.topic()` */
  topicKey?: TopicKeyReader;
}

/**
 * Resolve a stream endpoint from the sources map and assert its transport.
 *
 * Throws a tagged Error (with `cause.status`) on any failure — mirroring the
 * canonical adapter's 4xx Response semantics but surfaced as an exception so
 * the in-process caller can `try/catch` instead of `instanceof Response`.
 */
export function resolveStreamEndpoint(
  sources: Sources,
  locator: StreamEndpointLocator,
  expectedTransport: "sse" | "ws",
  executorName: string,
): ResolvedStreamEndpoint {
  const dataSource = Object.hasOwn(sources, locator.source)
    ? (sources[locator.source] as Record<string, unknown>)
    : undefined;
  if (!dataSource) throw streamResolveError(executorName, locator, 400, "source not found");

  const { endpoint, schema, options } = resolveEndpoint(dataSource, locator.group, locator.method);
  if (typeof endpoint !== "function") {
    throw streamResolveError(executorName, locator, 400, "method not found");
  }
  if ((schema as { transport?: string } | undefined)?.transport !== expectedTransport) {
    throw streamResolveError(
      executorName,
      locator,
      400,
      `endpoint is not a ${expectedTransport.toUpperCase()} transport`,
    );
  }
  return {
    endpoint,
    schema: (schema ?? {}) as InProcessStreamSchema,
    topicKey: options?.topicKey,
  };
}

/** Validate subscribe variables against the endpoint schema (no-op when absent). */
export async function validateStreamVariables(
  raw: Record<string, unknown> | undefined,
  schema: InProcessStreamSchema,
): Promise<Record<string, unknown> | undefined> {
  if (!schema.variables) return raw;
  return (await validateSchema(
    schema.variables as Parameters<typeof validateSchema>[0],
    raw ?? {},
    "variables",
  )) as Record<string, unknown>;
}

/**
 * Hold each event's data to the endpoint's response schema, as the server
 * does before it writes one: what goes on is the schema's output, and the
 * first event that does not match fails the subscription.
 *
 * @param events - The events the endpoint produced
 * @param schema - Its response schema
 * @returns The events as the schema produces them
 * @throws RealtimeValidationError at the first event that does not match
 * @example
 * ```ts
 * const events = schema.response ? checkedEvents(raw, schema.response) : raw;
 * ```
 */
export async function* checkedEvents(
  events: AsyncIterable<SSEEvent<unknown>>,
  schema: StandardSchemaV1,
): AsyncGenerator<SSEEvent<unknown>, void, unknown> {
  for await (const event of events) {
    yield { ...event, data: await checkResponse(schema, event.data) };
  }
}

/** Build a resolution error tagged with `cause.status` for the playground UI. */
export function streamResolveError(
  executorName: string,
  locator: StreamEndpointLocator,
  status: number,
  msg: string,
): Error {
  const err = new Error(
    `${executorName}: failed to resolve [${locator.source}][${locator.group ?? ""}][${locator.method}] (${msg})`,
  );
  (err as Error & { cause?: unknown }).cause = { status };
  return err;
}

/** Wrap a downstream error (factory/onJoin/onMessage) preserving the cause chain. */
export function wrapStreamError(executorName: string, prefix: string, cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  const err = new Error(`${executorName}: ${prefix} — ${message}`);
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}
