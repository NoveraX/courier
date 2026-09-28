import type { ExecuteBackend, HttpResponse, InferClient } from "@noverax/courier";
import { buildClientProxy, HTTPError } from "@noverax/courier";
import type { AnyDefinedApi } from "@noverax/courier/define";

import { RecorderError } from "./errors";
import type { Fixture } from "./fixture";
import { fixturesToHar, sanitizeFixture } from "./fixture";
import { findFixture, replayAnswer } from "./match-fixture";
import type { RecorderClient, RecorderConfig } from "./recorder-types";
import type { RecordingTransport } from "./recording-transport";
import { createRecordingTransport } from "./recording-transport";

export type { RecorderClient, RecorderConfig, RecordMode } from "./recorder-types";

/**
 * Create a client that calls a real API and records its responses.
 *
 * The calls go to the source's endpoints at `targetUrl` — or at the
 * source's own `baseURL` — through the same executor `createCaller` uses,
 * or through a Courier proxy when `proxy` is set. Each response is recorded
 * as a fixture, a failed one too, and the call answers as a real client's
 * does: with the data, or rejecting with the `HTTPError` carrying the
 * status and body.
 *
 * @param config The source, where to call it, and the recording mode
 * @returns The recording client, and its recordings
 * @example
 * ```ts
 * const recorder = createRecorder({
 *   source: api,
 *   targetUrl: "https://staging.example.com",
 *   sanitize: (data) => redactTokens(data),
 * });
 *
 * await recorder.client.users.getAll(); // hits the API, records the response
 * const har = recorder.toHar();         // get HAR for saving
 * ```
 */
export function createRecorder<TSource extends AnyDefinedApi>(
  config: RecorderConfig<TSource>,
): RecorderClient<TSource> {
  const fixtures: Fixture[] = [];
  const transport = createRecordingTransport(config);
  const mode = config.mode ?? "record";
  const recorded = config.fixtures ?? [];

  const backend: ExecuteBackend = async (group, method, variables, options, raw) => {
    if (config.filter && !config.filter(group, method)) {
      throw new RecorderError("ENDPOINT_EXCLUDED", group, method, variables);
    }
    if (mode === "replay" || mode === "record-missing") {
      const fixture = findFixture(recorded, group, method, variables);
      if (fixture) return replayAnswer(fixture, raw);
      if (mode === "replay")
        throw new RecorderError("RECORDING_NOT_FOUND", group, method, variables);
    }
    const call = { group, method, variables };
    const response = await callAndCapture(transport, call, options);
    if (mode !== "passthrough" && response.status > 0) {
      const fixture = fixtureOf(transport, call, response);
      fixtures.push(config.sanitize ? sanitizeFixture(fixture, config.sanitize) : fixture);
    }
    if (response.error) throw response.error;
    return raw ? response : response.data;
  };

  return {
    client: recordingClient<TSource>(backend),
    getFixtures: () => [...fixtures],
    toHar: () => fixturesToHar(fixtures),
    clear() {
      fixtures.length = 0;
    },
  };
}

/* The proxy answers any member path, so it is the source's client by
   construction; the overload gives it that type, as `createCaller`'s do. */
function recordingClient<TSource extends AnyDefinedApi>(
  backend: ExecuteBackend,
): InferClient<TSource>;
function recordingClient(backend: ExecuteBackend): unknown {
  return buildClientProxy(backend);
}

interface Call {
  group: string;
  method: string;
  variables: unknown;
}

interface Captured extends HttpResponse {
  /** The error a failed call rejects with, after it is recorded */
  error?: HTTPError;
  duration: number;
  startedAt: string;
}

async function callAndCapture(
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

function fixtureOf(transport: RecordingTransport, call: Call, response: Captured): Fixture {
  return {
    ...call,
    request: transport.describe(call.group, call.method, call.variables),
    response: {
      status: response.status,
      data: response.data,
      headers: Object.fromEntries(response.headers),
    },
    duration: response.duration,
    recordedAt: response.startedAt,
  };
}
