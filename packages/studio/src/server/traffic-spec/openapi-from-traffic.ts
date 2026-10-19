import { addressOf } from "./call-address";
import { nameListItems } from "./list-items";
import { type CalledPath, pathTemplate } from "./path-template";
import type { JsonSchema } from "./sample-schema";
import { endpointOperation } from "./traffic-operation";

/** One recorded call of a source's endpoint, as an OpenAPI document is read from it. */
export interface TrafficCall {
  group: string;
  method: string;
  httpMethod: string | undefined;
  url: string | undefined;
  /** The origin of the page or app that made the call, which a path is read against. */
  origin?: string | undefined;
  variables: unknown;
  status: number | undefined;
  data: unknown;
  /** The answer was kept only in part */
  dataCut: boolean;
  transport: "http" | "sse" | "ws";
}

/** An OpenAPI document read from a source's traffic, and what it was read from. */
export interface TrafficSpec {
  document: JsonSchema;
  endpoints: number;
  calls: number;
  leftOut: { streams: number; unanswered: number; unaddressed: number; conflicting: string[] };
}

/** A call placed on its route: its path's segments after the base path, and its query. */
export interface PlacedCall extends CalledPath {
  call: TrafficCall;
  query: URLSearchParams;
}

/**
 * An OpenAPI 3.1 document of a source known only by its traffic, read from
 * the calls Studio recorded: each endpoint's route — its parameters named
 * after the variables they carried — its query or body, and its answer,
 * each schema merged from every call. The import wizard turns it into code,
 * so a source the app defines in its own code becomes a typed, declared one.
 * A path a browser recorded is read against the origin of the page that
 * made it. A stream, a call with no answer and one with no address Studio
 * can read say nothing a document can hold, and are counted as left out.
 *
 * @param source - The source's name, the document's title
 * @param calls - Its recorded calls
 * @returns The document, with how many endpoints and calls it holds
 * @example
 * ```ts
 * const { document } = openapiFromTraffic("billing", calls);
 * ```
 */
export function openapiFromTraffic(source: string, calls: readonly TrafficCall[]): TrafficSpec {
  const leftOut = { streams: 0, unanswered: 0, unaddressed: 0, conflicting: [] as string[] };
  const placed: PlacedCall[] = [];
  let origin: string | undefined;
  for (const call of calls) {
    if (call.transport !== "http") leftOut.streams++;
    else if (call.status === undefined) leftOut.unanswered++;
    else {
      const address = addressOf(call.url, call.origin);
      if (address === null) {
        leftOut.unaddressed++;
        continue;
      }
      origin ??= address.origin;
      const { pathname, searchParams } = address.url;
      placed.push({
        call,
        query: searchParams,
        variables: call.variables,
        segments: segmentsOf(pathname),
      });
    }
  }
  const base = basePath(placed);
  const byEndpoint = new Map<string, PlacedCall[]>();
  for (const one of placed) {
    const key = one.call.group ? `${one.call.group}.${one.call.method}` : one.call.method;
    const endpointCalls = byEndpoint.get(key) ?? [];
    if (endpointCalls.length === 0) byEndpoint.set(key, endpointCalls);
    endpointCalls.push({ ...one, segments: one.segments.slice(base.length) });
  }
  const paths: Record<string, Record<string, JsonSchema>> = {};
  for (const [key, endpointCalls] of byEndpoint) {
    const template = pathTemplate(endpointCalls);
    const verb = (endpointCalls[0]?.call.httpMethod ?? "GET").toLowerCase();
    if (!template) continue;
    const route = paths[template.path] ?? {};
    paths[template.path] = route;
    if (route[verb]) {
      leftOut.conflicting.push(key);
      continue;
    }
    route[verb] = endpointOperation(endpointCalls, template, verb);
  }
  const groups = [...new Set(placed.map((one) => one.call.group).filter((group) => group !== ""))];
  const schemas = nameListItems(paths);
  return {
    document: {
      openapi: "3.1.0",
      info: {
        title: source,
        version: "0.0.0",
        description: `Read from ${placed.length} calls Studio recorded.`,
      },
      servers: [{ url: serverUrl(origin, base, placed.length > 0) }],
      tags: groups.map((name) => ({ name })),
      paths,
      ...(Object.keys(schemas).length > 0 && { components: { schemas } }),
    },
    endpoints: Object.values(paths).reduce((sum, route) => sum + Object.keys(route).length, 0),
    calls: placed.length,
    leftOut,
  };
}

function segmentsOf(pathname: string): string[] {
  return pathname
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        /* A segment that is not valid percent-encoding is kept as it was sent. */
        return segment;
      }
    });
}

/* The API's address: its origin and base path; the base path alone for calls made by path from a page of no known origin, which reach the page's own. */
function serverUrl(origin: string | undefined, base: readonly string[], placed: boolean): string {
  const path = base.length > 0 ? `/${base.join("/")}` : "";
  if (origin !== undefined) return `${origin}${path}`;
  return placed ? path || "/" : "http://localhost";
}

/* The segments every endpoint's paths start with — the API's own base path — when there are several endpoints, each keeping one of its own. */
function basePath(placed: readonly PlacedCall[]): string[] {
  const endpoints = new Set(placed.map((one) => `${one.call.group}.${one.call.method}`));
  if (endpoints.size < 2 || placed.length === 0) return [];
  const shortest = placed.reduce((least, one) => Math.min(least, one.segments.length), Infinity);
  const base: string[] = [];
  for (let at = 0; at < shortest - 1; at++) {
    const segment = placed[0]?.segments[at];
    if (segment === undefined || !placed.every((one) => one.segments[at] === segment)) break;
    base.push(segment);
  }
  return base;
}
