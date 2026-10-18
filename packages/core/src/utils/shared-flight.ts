import { abortReason } from "./abort-reason";
import { readUntilLeft } from "./read-until-left";
import type { SharingCall } from "./shared-answer";

/** One request in flight, and the calls waiting for its answer, first to wait first. */
interface Flight {
  readonly waiters: Set<Waiter>;
  readonly controller: AbortController;
  /** Told the answer, and the call it is the answer to, before any call reads it */
  readonly keep: KeepAnswer | undefined;
}

interface Waiter {
  readonly resolve: (response: Response) => void;
  readonly reject: (error: unknown) => void;
  readonly signal: AbortSignal | undefined;
  readonly call: SharingCall | undefined;
  settled: boolean;
}

/** What a flight's answer is kept with, and the call it belongs to. */
export type KeepAnswer = (response: Response, owner: SharingCall | undefined) => void;

/* The requests in flight that an identical one joins, by what they send. */
const flights = new Map<string, Flight>();

/**
 * Send a request, or join the identical one already in flight: every call
 * gets an answer of its own — the same status, headers and bytes, a body it
 * reads alone — while one request reaches the server. A call that stops
 * waiting leaves without the others noticing; the request is cancelled when
 * the last one leaves. A request is joined until its answer arrives, never
 * after: a later call sends its own.
 *
 * The request belongs to the call that still waits for it when its answer
 * comes, the first one to have waited: the one that sent it, or, once that
 * one has left, the first that joined after. Every other call still
 * waiting is told whose request answered it; a call that left is told
 * nothing, and gets no answer.
 *
 * @param key - What the request sends, written out; requests with one key are identical
 * @param signal - Fires when this call stops waiting
 * @param send - Sends the request, cancelled through the signal it is given, if any
 * @param call - The call, as Studio knows it, and what it is told when another's request answers it
 * @param keep - Told a request's answer and the call it belongs to, before any call reads it: only the call that sends the request gives one
 * @returns This call's answer
 * @example
 * ```ts
 * const response = await shareFlight(flightKey, init.signal, (signal) => fetch(url, { ...init, signal }));
 * ```
 */
export function shareFlight(
  key: string,
  signal: AbortSignal | undefined,
  send: (signal: AbortSignal | undefined) => Promise<Response>,
  call?: SharingCall,
  keep?: KeepAnswer,
): Promise<Response> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  const flight = flights.get(key) ?? takeOff(key, send, signal !== undefined, keep);
  return new Promise<Response>((resolve, reject) => {
    const waiter: Waiter = { resolve, reject, signal, call, settled: false };
    flight.waiters.add(waiter);
    signal?.addEventListener("abort", () => leave(key, flight, waiter), { once: true });
  });
}

/* A first call that cannot stop waiting keeps the request going whoever else leaves, so it goes without a signal. */
function takeOff(
  key: string,
  send: (signal: AbortSignal | undefined) => Promise<Response>,
  cancellable: boolean,
  keep: KeepAnswer | undefined,
): Flight {
  const flight: Flight = { waiters: new Set(), controller: new AbortController(), keep };
  flights.set(key, flight);
  send(cancellable ? flight.controller.signal : undefined).then(
    (response) => land(key, flight, response),
    (error: unknown) => crash(key, flight, error),
  );
  return flight;
}

function leave(key: string, flight: Flight, waiter: Waiter): void {
  if (waiter.settled) return;
  waiter.settled = true;
  flight.waiters.delete(waiter);
  waiter.reject(waiter.signal ? abortReason(waiter.signal) : undefined);
  if (flight.waiters.size > 0) return;
  if (flights.get(key) === flight) flights.delete(key);
  flight.controller.abort(waiter.signal?.reason);
}

/* Every waiter is handed a copy made before any of them reads; the last takes the answer itself. */
function land(key: string, flight: Flight, response: Response): void {
  if (flights.get(key) === flight) flights.delete(key);
  const waiting = [...flight.waiters].filter((waiter) => !waiter.settled);
  if (waiting.length === 0) {
    void response.body?.cancel().catch(() => undefined);
    return;
  }
  flight.keep?.(response, waiting[0]?.call);
  tellShared(waiting);
  const answers = waiting.map((_, index) =>
    index === waiting.length - 1 ? response : response.clone(),
  );
  waiting.forEach((waiter, index) => {
    waiter.settled = true;
    try {
      waiter.resolve(readUntilLeft(answers[index] ?? response, waiter.signal));
    } catch (error) {
      waiter.reject(error);
    }
  });
}

function crash(key: string, flight: Flight, error: unknown): void {
  if (flights.get(key) === flight) flights.delete(key);
  const waiting = [...flight.waiters].filter((waiter) => !waiter.settled);
  tellShared(waiting);
  for (const waiter of waiting) {
    waiter.settled = true;
    waiter.reject(error);
  }
}

/* The first call still waiting owns the request; every other one is told so, before it is answered. */
function tellShared(waiting: readonly Waiter[]): void {
  const owner = waiting[0]?.call?.id;
  for (const waiter of waiting.slice(1)) waiter.call?.onShared?.({ by: "flight", with: owner });
}
