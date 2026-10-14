import type { extractSourceMap, SchemaField } from "@noverax/courier-studio-core";
import type { AgentMark } from "./agent-marks";
import type { PageMark } from "./page-marks";

/** Every verb an endpoint can be addressed with, as the scan reports it. */
export type ScannedHttpMethod =
  | "get"
  | "head"
  | "options"
  | "query"
  | "post"
  | "put"
  | "patch"
  | "delete";

/** How an endpoint is shaped, as the APIs page and mock wizard read it. */
export interface ScannedEndpointAnalysis {
  hasResponseType: boolean;
  hasVariablesType: boolean;
  hasValidation: boolean;
  httpMethod: ScannedHttpMethod;
  path: string;
  type: "query" | "mutation" | null;
  /** How a stream or a channel is carried; absent for plain HTTP. */
  transport?: "sse" | "ws";
  /** The source's middleware, in the order it runs. */
  middleware?: string[];
  /** The variables its schema describes, with a placeholder for each field. */
  variablesStub?: Record<string, unknown>;
  /** The fields its variables schema declares, with their types and whether each is required. */
  variablesFields?: SchemaField[];
  /** What the endpoint's `.defaults()` fills in for a variable a call leaves out. */
  variablesDefaults?: Record<string, unknown>;
  /** A channel whose messages from the client have a schema. */
  hasReceiveSchema?: true;
  /** A stream or a channel the app serves itself, rather than an upstream. */
  served?: true;
  /** What the project's `agents` policy decided for it; absent for a stream or a channel. */
  agent?: AgentMark;
  /** Whether a page may call it through the proxy, and the mark that says so. */
  page?: PageMark;
}

export interface ScannedEndpoint {
  name: string;
  analysis: ScannedEndpointAnalysis;
}

/** What the project's config decides for an endpoint: whether agents and pages may call it. */
export interface EndpointMarks {
  agent: AgentMark | undefined;
  page: PageMark | undefined;
}

const HTTP_METHODS: ReadonlyArray<ScannedHttpMethod> = [
  "get",
  "head",
  "options",
  "query",
  "post",
  "put",
  "patch",
  "delete",
];

type MapEndpoint = ReturnType<
  typeof extractSourceMap
>[string]["groups"][string]["endpoints"][string];

/**
 * One endpoint as the source catalogue describes it: its verb, path and
 * kind, what its schemas declare, and what the config decides for it.
 *
 * @param name - The endpoint's own name
 * @param endpoint - The endpoint as the source map reads it
 * @param marks - What the agents policy and the `.expose()` marks decide for it
 * @returns The endpoint, described
 * @example
 * ```ts
 * describeEndpoint("list", endpoint, { agent: undefined, page: { exposed: true, reason: "marked .expose()" } });
 * ```
 */
export function describeEndpoint(
  name: string,
  endpoint: MapEndpoint,
  { agent, page }: EndpointMarks,
): ScannedEndpoint {
  const method = endpoint.httpMethod?.toLowerCase();
  return {
    name,
    analysis: {
      hasResponseType: endpoint.hasResponseSchema,
      hasVariablesType: endpoint.hasVariablesSchema,
      hasValidation: endpoint.hasResponseSchema || endpoint.hasVariablesSchema,
      httpMethod: HTTP_METHODS.find((known) => known === method) ?? "get",
      path: endpoint.path ?? "",
      type: endpoint.type ?? null,
      ...(endpoint.transport && { transport: endpoint.transport }),
      ...(endpoint.middleware?.length && { middleware: [...endpoint.middleware] }),
      ...(endpoint.variablesStub && { variablesStub: endpoint.variablesStub }),
      ...(endpoint.variablesFields && { variablesFields: endpoint.variablesFields }),
      ...(endpoint.variablesDefaults && { variablesDefaults: endpoint.variablesDefaults }),
      ...(endpoint.hasReceiveSchema && { hasReceiveSchema: true as const }),
      ...(endpoint.served && { served: true as const }),
      ...(agent && { agent }),
      ...(page && { page }),
    },
  };
}
