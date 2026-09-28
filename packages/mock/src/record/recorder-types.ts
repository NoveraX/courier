import type { InferClient } from "@noverax/courier";
import type { AnyDefinedApi } from "@noverax/courier/define";

import type { Fixture } from "./fixture";
import type { HarLog } from "./har-format";

/**
 * What the recorder does with a call:
 *
 * - `record` — call the backend and record every response (the default)
 * - `replay` — answer from `fixtures` only; a call with no recording fails
 * - `passthrough` — call the backend and record nothing
 * - `record-missing` — answer from `fixtures` when a call has a recording,
 *   otherwise call the backend and record the response
 */
export type RecordMode = "record" | "replay" | "passthrough" | "record-missing";

/** Configuration for the recorder */
export interface RecorderConfig<TSource extends AnyDefinedApi> {
  /** The API definition the calls are made from: its endpoints' methods, paths and schemas */
  source: TSource;
  /**
   * Where the calls go, in place of the source's `baseURL` — a staging host,
   * say. Each call keeps its endpoint's method and path.
   */
  targetUrl?: string;
  /**
   * Record through a Courier proxy — a `createCourierServer`, or an app with
   * Courier's handler mounted — instead of calling the API directly: the
   * proxy route's URL, and the name the source is registered under there.
   */
  proxy?: { url: string; source: string };
  /** Recording mode (default: "record") */
  mode?: RecordMode;
  /** Recordings to answer from in `replay` and `record-missing` modes */
  fixtures?: readonly Fixture[];
  /** Filter which endpoints to record; a call to any other is refused */
  filter?: (group: string, method: string) => boolean;
  /** Sanitize sensitive data before saving; the call itself still returns the real data */
  sanitize?: (data: unknown) => unknown;
}

/** Recorder client that captures real API responses */
export interface RecorderClient<TSource extends AnyDefinedApi> {
  /** Client typed like the source's own, which records what it calls */
  client: InferClient<TSource>;
  /** Get recorded fixtures */
  getFixtures(): Fixture[];
  /** Get recordings in HAR format */
  toHar(): HarLog;
  /** Clear recorded fixtures */
  clear(): void;
}
