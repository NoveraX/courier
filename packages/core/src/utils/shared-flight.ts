import { abortReason } from "./abort-reason";

/** One request in flight, and the calls waiting for its answer. */
interface Flight {
  readonly waiters: Set<Waiter>;
  readonly controller: AbortController;
}

interface Waiter {
  readonly resolve: (response: Response) => void;
  readonly reject: (error: unknown) => void;
  readonly signal: AbortSignal | undefined;
  settled: boolean;
}

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
 * @param key - What the request sends, written out; requests with one key are identical
 * @param signal - Fires when this call stops waiting
 * @param send - Sends the request, cancelled through the signal it is given, if any
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
): Promise<Response> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  const flight = flights.get(key) ?? takeOff(key, send, signal !== undefined);
  return new Promise<Response>((resolve, reject) => {
    const waiter: Waiter = { resolve, reject, signal, settled: false };
    flight.waiters.add(waiter);
    signal?.addEventListener("abort", () => leave(key, flight, waiter), { once: true });
  });
}

/* A first call that cannot stop waiting keeps the request going whoever else leaves, so it goes without a signal. */
function takeOff(
  key: string,
  send: (signal: AbortSignal | undefined) => Promise<Response>,
  cancellable: boolean,
): Flight {
  const flight: Flight = { waiters: new Set(), controller: new AbortController() };
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
  for (const waiter of flight.waiters) {
    if (waiter.settled) continue;
    waiter.settled = true;
    waiter.reject(error);
  }
}

/* An answer whose body fails with the call's own reason when the call stops waiting, as fetch's does. */
function readUntilLeft(response: Response, signal: AbortSignal | undefined): Response {
  const { body } = response;
  /* React Native has no streams, nor a body to cut short. */
  if (signal === undefined || body === null || typeof ReadableStream === "undefined") {
    return response;
  }
  const reader = body.getReader();
  let output: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller;
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (signal.aborted) return;
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason: unknown) {
      return reader.cancel(reason);
    },
  });
  signal.addEventListener(
    "abort",
    () => {
      output?.error(abortReason(signal));
      void reader.cancel(abortReason(signal)).catch(() => undefined);
    },
    { once: true },
  );
  const copy = new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  return Object.defineProperties(copy, {
    url: { value: response.url },
    redirected: { value: response.redirected },
    type: { value: response.type },
  });
}
