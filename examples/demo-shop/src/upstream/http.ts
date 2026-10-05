import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

/** A status, and the JSON body sent with it. */
export type Answer = readonly [status: number, body: unknown];

/** A request as the routes read it. */
export interface UpstreamRequest {
  method: string;
  /** The path's segments: `/orders/o_1/cancel` is `["orders", "o_1", "cancel"]`. */
  parts: string[];
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  /** The JSON body, or `undefined` for none or one that is not JSON. */
  body: unknown;
}

/** The answer to a route the upstream does not have. */
export const NOT_FOUND: Answer = [404, { message: "No such route" }];

/* The upstreams take small JSON bodies; a larger one is refused unread. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Read a request's method, path, query and JSON body.
 *
 * @param req - The request
 * @returns The request, or `null` when its body is larger than the upstream reads
 * @example
 * ```ts
 * const request = await readRequest(req);
 * ```
 */
export async function readRequest(req: IncomingMessage): Promise<UpstreamRequest | null> {
  const url = new URL(req.url ?? "/", "http://upstream");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return {
    method: req.method ?? "GET",
    parts: url.pathname.split("/").filter(Boolean),
    query: url.searchParams,
    headers: req.headers,
    body: jsonOf(Buffer.concat(chunks).toString("utf8")),
  };
}

/**
 * Send an answer as JSON, echoing the request's id when it has one.
 *
 * @param req - The request answered
 * @param res - Its response
 * @param answer - The status and body
 * @example
 * ```ts
 * send(req, res, [200, products]);
 * ```
 */
export function send(req: IncomingMessage, res: ServerResponse, [status, body]: Answer): void {
  const id = req.headers["x-request-id"];
  res.writeHead(status, {
    "content-type": "application/json",
    ...(typeof id === "string" && { "x-request-id": id }),
  });
  res.end(JSON.stringify(body));
}

/**
 * Take between `min` and `max` milliseconds, as a real backend takes its time.
 *
 * @param min - The shortest wait, in ms
 * @param max - The longest wait, in ms
 * @returns When the wait is over
 * @example
 * ```ts
 * await latency(40, 120);
 * ```
 */
export function latency(min: number, max: number): Promise<void> {
  return sleep(min + Math.random() * (max - min));
}

/**
 * Whether something with the given probability happens this time.
 *
 * @param probability - From 0, never, to 1, always
 * @returns Whether it happens
 * @example
 * ```ts
 * if (chance(0.1)) return [502, { message: "The card network did not answer" }];
 * ```
 */
export function chance(probability: number): boolean {
  return Math.random() < probability;
}

/* A body that is not JSON holds nothing the routes read, and is answered as one without fields. */
function jsonOf(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
