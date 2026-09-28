import type { HarEntry, HarLog } from "./har-format";
import { createHarLog } from "./har-format";

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
    request: { method: entry.request.method, url: entry.request.url },
    response: {
      status: entry.response.status,
      data: safeJsonParse(entry.response.content.text),
      headers: Object.fromEntries(entry.response.headers.map((h) => [h.name, h.value])),
    },
    duration: entry.time,
    recordedAt: entry.startedDateTime,
  }));
}

/** Convert Courier fixtures back to HAR format */
export function fixturesToHar(fixtures: Fixture[]): HarLog {
  const har = createHarLog();
  for (const fixture of fixtures) {
    const entry: HarEntry = {
      startedDateTime: fixture.recordedAt,
      time: fixture.duration,
      request: {
        method: fixture.request?.method ?? "POST",
        url: fixture.request?.url ?? "/api/request",
        headers: [{ name: "Content-Type", value: "application/json" }],
        postData: {
          mimeType: "application/json",
          text: JSON.stringify({
            group: fixture.group,
            method: fixture.method,
            variables: fixture.variables,
          }),
        },
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
