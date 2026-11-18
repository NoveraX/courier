import type { WSHandler } from "../../src/adapter/ws-types";
import type { HTTPRequestHead } from "../../src/realtime/ws/http-protocol";

/**
 * What an entry does with one request: it reaches a replica through `pass`,
 * and the answer comes back as the entry gives it; `signal` aborts once the
 * client has given the request up.
 */
export type EntryWay = (
  head: HTTPRequestHead,
  pass: () => Promise<Response>,
  signal: AbortSignal,
) => Promise<Response>;

/** What reached the replicas, request by request. */
export interface EntryLog {
  readonly heads: HTTPRequestHead[];
}

/**
 * A `fetch` that reaches WebSocket handlers in-process, as an entry in
 * front of their replicas does: each request to the next replica in turn,
 * through `way`, which may hold an answer back or lose it on the way.
 *
 * @param replicas - The handlers, in the order the entry takes them
 * @param way - What the entry does with each request; it passes it on as it is by default
 * @returns The `fetch`, and the heads of the requests it carried
 * @example
 * ```ts
 * const { fetch } = entryTo([a, b]);
 * createHTTPSocket(url, { fetch, mode: "stream", probeMs: 3000 });
 * ```
 */
export function entryTo(
  replicas: readonly WSHandler[],
  way: EntryWay = (_head, pass) => pass(),
): { readonly fetch: typeof fetch; readonly log: EntryLog } {
  const log: EntryLog = { heads: [] };
  let next = 0;
  const entry = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const text = await request.clone().text();
    const head = JSON.parse(text.split("\n")[0] ?? "{}") as HTTPRequestHead;
    log.heads.push(head);
    const replica = replicas[next++ % replicas.length] as WSHandler;
    return way(head, () => replica.handleHTTP(request, "203.0.113.9"), request.signal);
  };
  return { fetch: entry as typeof fetch, log };
}

/**
 * An entry that holds every stream's answer until it has ended, as a proxy
 * that buffers what it carries does: polls pass, a stream's bytes come at
 * its end.
 */
export const holdingStreams: EntryWay = async (head, pass, signal) => {
  const answer = await pass();
  if (head.op !== "stream" || answer.body === null) return answer;
  /* Given up by the client, the stream is let go of upstream, as a proxy lets go of it. */
  const pipe = new TransformStream<Uint8Array, Uint8Array>();
  answer.body.pipeTo(pipe.writable, { signal }).catch(() => undefined);
  const whole = await new Response(pipe.readable).text();
  return new Response(whole, { status: answer.status, headers: answer.headers });
};
