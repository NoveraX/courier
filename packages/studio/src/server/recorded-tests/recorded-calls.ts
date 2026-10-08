import type { Fixture } from "@noverax/courier-mock/testing";
import { scrubbedRequest } from "../session-file/scrub-secrets";
import type { SavedRequest } from "../session-types";

/** Why requests were left out of a test, by how many. */
export interface LeftOut {
  /** Still in flight, aborted, or a stream or channel: no answer to check */
  unanswered: number;
  /** Made to a source the config no longer has */
  unknownSource: number;
  /** The same call with the same answer as one kept */
  repeats: number;
}

/** The calls a test checks, by source, and what was left out. */
export interface RecordedCalls {
  bySource: Map<string, Fixture[]>;
  leftOut: LeftOut;
  /** Every value replaced as a secret: `#3 orders.place · variables.cardNumber` */
  redactions: string[];
}

/* The answer headers a recording keeps: what the body is. */
const KEPT_HEADERS: ReadonlySet<string> = new Set(["content-type"]);

/**
 * The requests of a session as the recordings of a test: those with an
 * answer, made to a source the config has, each kept once — every value
 * named like a secret replaced, and the part a body was cut to marked, so
 * a check leaves both alone.
 *
 * @param requests - The session's requests, oldest first
 * @param sources - The names of the sources the config has
 * @returns The recordings by source, what was left out, and what was replaced
 * @example
 * ```ts
 * const { bySource } = recordedCalls(session.requests, new Set(Object.keys(config.sources)));
 * ```
 */
export function recordedCalls(
  requests: readonly SavedRequest[],
  sources: ReadonlySet<string>,
): RecordedCalls {
  const calls: RecordedCalls = {
    bySource: new Map(),
    leftOut: { unanswered: 0, unknownSource: 0, repeats: 0 },
    redactions: [],
  };
  const seen = new Set<string>();
  for (const request of requests) {
    if (request.statusCode === undefined || !ANSWERED.has(request.status)) {
      calls.leftOut.unanswered++;
    } else if (!sources.has(request.source)) {
      calls.leftOut.unknownSource++;
    } else {
      keep(calls, seen, request);
    }
  }
  return calls;
}

const ANSWERED: ReadonlySet<string> = new Set(["success", "error", "validation_error"]);

function keep(calls: RecordedCalls, seen: Set<string>, request: SavedRequest): void {
  const places: string[] = [];
  const scrubbed = scrubbedRequest(request, 0, places);
  const fixture = fixtureOf(scrubbed, places.map(placeInRecording));
  const key = JSON.stringify([
    fixture.source,
    fixture.group,
    fixture.method,
    fixture.variables,
    fixture.response,
  ]);
  if (seen.has(key)) {
    calls.leftOut.repeats++;
    return;
  }
  seen.add(key);
  const recorded = calls.bySource.get(request.source) ?? [];
  recorded.push(fixture);
  calls.bySource.set(request.source, recorded);
  const name = request.group ? `${request.group}.${request.method}` : request.method;
  const at = [...calls.bySource.values()].reduce((count, list) => count + list.length, 0);
  for (const place of fixture.redacted ?? []) calls.redactions.push(`#${at} ${name} · ${place}`);
}

function fixtureOf(request: SavedRequest, redacted: string[]): Fixture {
  const partial = [
    ...(request.variablesCutFrom !== undefined ? (["variables"] as const) : []),
    ...(request.dataCutFrom !== undefined ? (["response"] as const) : []),
  ];
  const headers = Object.fromEntries(
    Object.entries(request.responseHeaders ?? {}).filter(([name]) =>
      KEPT_HEADERS.has(name.toLowerCase()),
    ),
  );
  return {
    source: request.source,
    group: request.group ?? "",
    method: request.method,
    variables: request.variables,
    ...(request.url !== undefined &&
      request.httpMethod !== undefined && {
        request: { method: request.httpMethod, url: request.url },
      }),
    response: { status: request.statusCode ?? 0, data: request.data, headers },
    duration: Math.round(request.timing?.total ?? 0),
    recordedAt: new Date(request.startedAt).toISOString(),
    ...(redacted.length > 0 && { redacted }),
    ...(partial.length > 0 && { partial }),
  };
}

/* `requests[0].data.user.token` → `response.user.token`: a place within the recording itself. */
function placeInRecording(place: string): string {
  return place.replace(/^requests\[\d+\]\./, "").replace(/^data(?=[.[]|$)/, "response");
}
