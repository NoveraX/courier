import type { InferClient } from "@noverax/courier";
import type { AnyDefinedApi } from "@noverax/courier/define";
import type { ExecuteBackend } from "@noverax/courier/internal";
import { buildClientProxy } from "@noverax/courier/internal";

import { callAndCapture, fixtureOf } from "./capture-call";
import { RecorderError } from "./errors";
import type { Fixture } from "./fixture";
import { fixturesToHar, sanitizeFixture } from "./fixture";
import { findFixture, replayAnswer } from "./match-fixture";
import type { RecorderClient, RecorderConfig } from "./recorder-types";
import { createRecordingTransport } from "./recording-transport";

export type { RecorderClient, RecorderConfig, RecordMode, Sanitizer } from "./recorder-types";

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
      const fixture = findFixture(recorded, group, method, asRecorded(config, variables));
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

/* The variables as a recording made with the config's sanitizer holds them. */
function asRecorded(config: RecorderConfig<AnyDefinedApi>, variables: unknown): unknown {
  return config.sanitize ? config.sanitize(variables, "variables") : variables;
}
