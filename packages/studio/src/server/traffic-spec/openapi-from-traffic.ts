import { type CalledPath, pathTemplate } from "./path-template";
import type { JsonSchema } from "./sample-schema";
import { endpointOperation } from "./traffic-operation";

/** One recorded call of a source's endpoint, as an OpenAPI document is read from it. */
export interface TrafficCall {
  group: string;
  method: string;
  httpMethod: string | undefined;
  url: string | undefined;
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
  leftOut: { streams: number; unanswered: number; conflicting: string[] };
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
 * A stream, a call with no answer and one with no address say nothing a
 * document can hold, and are counted as left out.
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
  const leftOut = { streams: 0, unanswered: 0, conflicting: [] as string[] };
  const placed: PlacedCall[] = [];
  let origin: string | undefined;
  for (const call of calls) {
    if (call.transport !== "http") leftOut.streams++;
    else if (call.status === undefined || !call.url) leftOut.unanswered++;
    else {
      const url = new URL(call.url);
      origin ??= url.origin;
      placed.push({
        call,
        query: url.searchParams,
        variables: call.variables,
        segments: segmentsOf(url.pathname),
      });
    }
  }
  const base = basePath(placed);
  const byEndpoint = new Map<string, PlacedCall[]>();
  for (const one of placed) {
    const key = one.call.group ? `${one.call.group}.${one.call.method}` : one.call.method;
    byEndpoint.set(key, [
      ...(byEndpoint.get(key) ?? []),
      { ...one, segments: one.segments.slice(base.length) },
    ]);
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
  return {
    document: {
      openapi: "3.1.0",
      info: {
        title: source,
        version: "0.0.0",
        description: `Read from ${placed.length} calls Studio recorded.`,
      },
      servers: [
        { url: `${origin ?? "http://localhost"}${base.length > 0 ? `/${base.join("/")}` : ""}` },
      ],
      tags: groups.map((name) => ({ name })),
      paths,
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

/* The segments every endpoint's paths start with — the API's own base path — when there are several endpoints, each keeping one of its own. */
function basePath(placed: readonly PlacedCall[]): string[] {
  const endpoints = new Set(placed.map((one) => `${one.call.group}.${one.call.method}`));
  if (endpoints.size < 2 || placed.length === 0) return [];
  const shortest = Math.min(...placed.map((one) => one.segments.length));
  const base: string[] = [];
  for (let at = 0; at < shortest - 1; at++) {
    const segment = placed[0]?.segments[at];
    if (segment === undefined || !placed.every((one) => one.segments[at] === segment)) break;
    base.push(segment);
  }
  return base;
}
