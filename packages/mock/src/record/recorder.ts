import type { ExecuteBackend, TypedClient } from "@noverax/courier";
import { buildClientProxy } from "@noverax/courier";
import type { DefinedApi } from "@noverax/courier/define";

import type { Fixture } from "./fixture";
import { sanitizeFixture } from "./fixture";
import type { HarLog } from "./har-format";
import { createHarEntry, createHarLog } from "./har-format";

/** Recording mode (inspired by Polly.js) */
export type RecordMode = "record" | "replay" | "passthrough" | "record-missing";

/** Configuration for the recorder */
export interface RecorderConfig {
  /** Recording mode (default: "record") */
  mode?: RecordMode;
  /** Target base URL to proxy requests to */
  targetUrl: string;
  /** Filter which endpoints to record */
  filter?: (group: string, method: string) => boolean;
  /** Sanitize sensitive data before saving */
  sanitize?: (data: unknown) => unknown;
}

/** Recorder client that captures real API responses */
export interface RecorderClient<TApi extends DefinedApi<any>> {
  /** Real client that also records responses */
  client: TypedClient<TApi>;
  /** Get recorded fixtures */
  getFixtures(): Fixture[];
  /** Get recordings in HAR format */
  toHar(): HarLog;
  /** Clear recorded fixtures */
  clear(): void;
}

/**
 * Create a recording client that proxies to a real API and captures responses.
 *
 * @example
 * ```ts
 * const recorder = createRecorder<typeof api>({
 *   targetUrl: "https://api.example.com",
 *   sanitize: (data) => redactTokens(data),
 * });
 *
 * await recorder.client.users.getAll(); // hits real API, records response
 * const har = recorder.toHar();         // get HAR for saving
 * ```
 */
export function createRecorder<TApi extends DefinedApi<any>>(
  config: RecorderConfig,
): RecorderClient<TApi> {
  const fixtures: Fixture[] = [];
  const baseUrl = config.targetUrl.replace(/\/$/, "");

  const backend: ExecuteBackend = async (group, method, variables) => {
    if (config.filter && !config.filter(group, method)) {
      throw new Error(`[courier-mock/recorder] Endpoint "${group}.${method}" excluded by filter`);
    }

    const start = performance.now();
    const url = `${baseUrl}/api/request`;
    const body = JSON.stringify({ group, method, variables });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const responseText = await response.text();
    const duration = Math.round(performance.now() - start);
    const data = safeJsonParse(responseText);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let fixture: Fixture = {
      group,
      method,
      variables,
      response: {
        status: response.status,
        data,
        headers: responseHeaders,
      },
      duration,
      recordedAt: new Date().toISOString(),
    };

    if (config.sanitize) {
      fixture = sanitizeFixture(fixture, config.sanitize);
    }

    fixtures.push(fixture);

    if (!response.ok) {
      throw new Error(`[courier-mock/recorder] ${group}.${method} returned ${response.status}`);
    }

    return data;
  };

  return {
    client: buildClientProxy(backend) as TypedClient<TApi>,

    getFixtures() {
      return [...fixtures];
    },

    toHar() {
      const har = createHarLog();
      for (const fixture of fixtures) {
        har.log.entries.push(
          createHarEntry({
            group: fixture.group,
            method: fixture.method,
            variables: fixture.variables,
            url: `${baseUrl}/api/request`,
            httpMethod: "POST",
            requestHeaders: { "Content-Type": "application/json" },
            requestBody: JSON.stringify({
              group: fixture.group,
              method: fixture.method,
              variables: fixture.variables,
            }),
            status: fixture.response.status,
            statusText: fixture.response.status === 200 ? "OK" : "Error",
            responseHeaders: fixture.response.headers,
            responseBody: JSON.stringify(fixture.response.data),
            duration: fixture.duration,
          }),
        );
      }
      return har;
    },

    clear() {
      fixtures.length = 0;
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
