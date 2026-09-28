import type { HarEntry, HarLog } from "./har-format";
import { createHarLog } from "./har-format";

/** The scheme of the URL an entry gets for a fixture that names no request. */
const CALL_URL = "courier:";

/** A single fixture entry with courier metadata */
export interface Fixture {
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
}

/** Convert HAR entries to Courier fixtures */
export function harToFixtures(har: HarLog): Fixture[] {
  return har.log.entries.map((entry) => ({
    group: entry._courier.group,
    method: entry._courier.method,
    variables: entry._courier.variables,
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
        group: fixture.group,
        method: fixture.method,
        variables: fixture.variables,
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

/** Sanitize a fixture by applying a transform to sensitive data */
export function sanitizeFixture(fixture: Fixture, sanitizer: (data: unknown) => unknown): Fixture {
  return {
    ...fixture,
    response: {
      ...fixture.response,
      data: sanitizer(fixture.response.data),
    },
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
