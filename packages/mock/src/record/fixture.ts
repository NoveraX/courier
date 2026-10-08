import type { HarEntry, HarLog } from "./har-format";
import { createHarLog } from "./har-format";
import type { Sanitizer } from "./recorder-types";

/** The scheme of the URL an entry gets for a fixture that names no request. */
const CALL_URL = "courier:";

/** A single fixture entry with courier metadata */
export interface Fixture {
  /** The source the call was made to, when the recordings hold several APIs' calls */
  source?: string;
  group: string;
  method: string;
  variables?: unknown;
  /** The HTTP request the call was made as, when the recorder knows it */
  request?: { method: string; url: string };
  response: {
    status: number;
    data: unknown;
    headers: Record<string, string>;
  };
  duration: number;
  recordedAt: string;
  /**
   * Where a value was replaced because its name says it holds a secret —
   * `variables.password`, `response.user.accessToken`, `url?token` — so a
   * check of the recording leaves those places alone.
   */
  redacted?: string[];
  /** The parts kept only in part, being larger than Studio keeps whole: their schemas go unchecked. */
  partial?: Array<"variables" | "response">;
}

/** Convert HAR entries to Courier fixtures */
export function harToFixtures(har: HarLog): Fixture[] {
  return har.log.entries.map((entry) => ({
    ...(entry._courier.source !== undefined && { source: entry._courier.source }),
    group: entry._courier.group,
    method: entry._courier.method,
    variables: entry._courier.variables,
    ...(entry._courier.redacted !== undefined && { redacted: entry._courier.redacted }),
    ...(entry._courier.partial !== undefined && { partial: entry._courier.partial }),
    ...(!entry.request.url.startsWith(CALL_URL) && {
      request: { method: entry.request.method, url: entry.request.url },
    }),
    response: {
      status: entry.response.status,
      data: safeJsonParse(entry.response.content.text),
      headers: Object.fromEntries(entry.response.headers.map((h) => [h.name, h.value])),
    },
    duration: entry.time,
    recordedAt: entry.startedDateTime,
  }));
}

/**
 * Write fixtures as a HAR log, one entry per fixture.
 *
 * An entry's request is the one the fixture was recorded as — its method and
 * URL; the body the client built from the variables is not recorded, so the
 * entry carries none, and the variables stay in its `_courier` field, from
 * which {@link harToFixtures} reads them back. A fixture that names no request,
 * such as one written by hand, gets a `courier:` URL naming its call.
 *
 * @param fixtures - The fixtures
 * @returns The HAR log
 * @example
 * ```ts
 * writeFileSync("users.har", JSON.stringify(fixturesToHar(recorder.getFixtures())));
 * ```
 */
export function fixturesToHar(fixtures: Fixture[]): HarLog {
  const har = createHarLog();
  for (const fixture of fixtures) {
    const entry: HarEntry = {
      startedDateTime: fixture.recordedAt,
      time: fixture.duration,
      request: {
        ...(fixture.request ?? { method: "POST", url: callUrl(fixture) }),
        headers: [],
      },
      response: {
        status: fixture.response.status,
        statusText: fixture.response.status < 400 ? "OK" : "Error",
        headers: Object.entries(fixture.response.headers).map(([name, value]) => ({ name, value })),
        content: {
          size: 0,
          mimeType: "application/json",
          text: JSON.stringify(fixture.response.data),
        },
      },
      _courier: {
        ...(fixture.source !== undefined && { source: fixture.source }),
        group: fixture.group,
        method: fixture.method,
        variables: fixture.variables,
        ...(fixture.redacted !== undefined && { redacted: fixture.redacted }),
        ...(fixture.partial !== undefined && { partial: fixture.partial }),
      },
    };
    har.log.entries.push(entry);
  }
  return har;
}

/* The call a fixture stands for, when it names no request it was made as. */
function callUrl({ group, method }: Fixture): string {
  return group ? `${CALL_URL}${group}/${method}` : `${CALL_URL}${method}`;
}

/**
 * A recording with its sensitive values rewritten: the call's variables and
 * the answer's body go through `sanitizer`, and the request's URL loses its
 * query, which held the variables of a read as they were sent.
 *
 * @param fixture - The recording
 * @param sanitizer - Rewrites each value it is handed
 * @returns The recording, rewritten
 * @example
 * ```ts
 * sanitizeFixture(fixture, (data) => redact(data, ["password", "token"]));
 * ```
 */
export function sanitizeFixture(fixture: Fixture, sanitizer: Sanitizer): Fixture {
  const { variables, request, ...recorded } = fixture;
  return {
    ...recorded,
    ...(variables !== undefined && { variables: sanitizer(variables, "variables") }),
    ...(request && { request: { method: request.method, url: withoutQuery(request.url) } }),
    response: { ...fixture.response, data: sanitizer(fixture.response.data, "response") },
  };
}

function withoutQuery(url: string): string {
  const query = url.indexOf("?");
  return query === -1 ? url : url.slice(0, query);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
