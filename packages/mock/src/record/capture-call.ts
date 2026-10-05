import type { HttpResponse } from "@noverax/courier";
import { HTTPError } from "@noverax/courier";

import type { Fixture } from "./fixture";
import { recordedHeaders } from "./recorded-headers";
import type { RecordingTransport } from "./recording-transport";

/** A call by its endpoint, as a recording names it. */
export interface Call {
  group: string;
  method: string;
  variables: unknown;
}

/** What the backend answered a call, success or failure, and when. */
export interface Captured extends HttpResponse {
  /** The error a failed call rejects with, after it is recorded */
  error?: HTTPError;
  duration: number;
  startedAt: string;
}

/**
 * Make a call through a recording transport and keep whatever the backend
 * answered: a success, or a failure the backend answered with a status. A
 * call the backend never answered — refused, timed out — still rejects.
 *
 * @param transport - The backend's transport
 * @param call - The call
 * @param options - The call's options, such as its headers
 * @returns The answer, with how long it took and when it started
 * @throws {Error} When the backend could not be reached
 * @example
 * ```ts
 * const captured = await callAndCapture(transport, { group: "users", method: "list", variables: {} }, {});
 * captured.status; // → 200
 * ```
 */
export async function callAndCapture(
  transport: RecordingTransport,
  call: Call,
  options: Record<string, unknown>,
): Promise<Captured> {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const took = () => Math.round(performance.now() - start);
  try {
    const response = await transport.call(call.group, call.method, call.variables, options);
    return { ...response, duration: took(), startedAt };
  } catch (error) {
    if (!(error instanceof HTTPError)) throw error;
    const { status, headers } = error;
    const data: unknown = error.data;
    return { status, headers, data, error, duration: took(), startedAt };
  }
}

/**
 * A recording of a captured answer: the call, the HTTP request it became,
 * the answer with the headers worth keeping, and when.
 *
 * @param transport - The transport the call went through
 * @param call - The call
 * @param response - What the backend answered
 * @returns The fixture
 * @example
 * ```ts
 * const fixture = fixtureOf(transport, call, await callAndCapture(transport, call, {}));
 * ```
 */
export function fixtureOf(transport: RecordingTransport, call: Call, response: Captured): Fixture {
  return {
    ...call,
    request: transport.describe(call.group, call.method, call.variables),
    response: {
      status: response.status,
      data: response.data,
      headers: recordedHeaders(response.headers),
    },
    duration: response.duration,
    recordedAt: response.startedAt,
  };
}
