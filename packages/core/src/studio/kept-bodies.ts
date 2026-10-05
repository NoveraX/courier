import type { CarriedBody } from "./carried-body";

/** Which body of a request: the one it sent, or the one it was answered with. */
export type BodyPart = "request" | "response";

/** The most bytes of whole bodies kept: those of the latest requests. */
export const KEPT_BODY_BYTES: number = 64 * 1024 * 1024;

/** The whole bodies of the latest requests whose events carried only a part of them. */
export interface KeptBodies {
  /** Keep a request's body whole, when the event carries only a part of it. */
  keep(requestId: string, part: BodyPart, body: CarriedBody): void;
  /** A request's whole body as JSON, while it is kept. */
  textOf(requestId: string, part: BodyPart): string | undefined;
}

/**
 * Keep the whole bodies that request events carry only a part of, for a
 * Studio page that asks for one: the latest, up to `limit` bytes in all, the
 * oldest let go first. A body larger than the limit is not kept.
 *
 * @param limit - The most bytes kept
 * @returns The kept bodies
 * @example
 * ```ts
 * const bodies = createKeptBodies();
 * bodies.keep("req_1", "response", carriedBody(data));
 * bodies.textOf("req_1", "response"); // → the whole body as JSON
 * ```
 */
export function createKeptBodies(limit: number = KEPT_BODY_BYTES): KeptBodies {
  const kept = new Map<string, { text: string; bytes: number }>();
  let total = 0;
  return {
    keep(requestId, part, { whole }) {
      if (whole === undefined || whole.bytes > limit) return;
      kept.set(`${part}:${requestId}`, whole);
      total += whole.bytes;
      for (const [key, body] of kept) {
        if (total <= limit) break;
        kept.delete(key);
        total -= body.bytes;
      }
    },
    textOf: (requestId, part) => kept.get(`${part}:${requestId}`)?.text,
  };
}
