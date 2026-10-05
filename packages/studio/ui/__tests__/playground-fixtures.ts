/**
 * A project as the Playground tests see it: the `api` source its
 * `courier.config.ts` declares, and the runtime that hosts it.
 */

import type { EndpointAnalysis, ScannedEndpoint, ScannedSource } from "@/features/apis/types";
import type { RequestEntry } from "../src/store/types-request";
import type { BindingSnapshot } from "../src/store/types-ui";

function endpoint(name: string, analysis: Partial<EndpointAnalysis>): ScannedEndpoint {
  return {
    name,
    analysis: {
      hasResponseType: false,
      hasVariablesType: false,
      hasValidation: false,
      httpMethod: "get",
      path: "",
      type: "query",
      ...analysis,
    },
  };
}

export const API: ScannedSource = {
  name: "api",
  baseURL: "http://localhost:7501",
  filePath: "src/api.ts",
  isImported: false,
  hasClient: false,
  proxyPath: { http: "/api/request", sse: "/api/sse" },
  groups: [
    {
      name: "users",
      prefix: "users",
      filePath: "src/api.ts",
      endpoints: [
        endpoint("byId", { path: ":id" }),
        endpoint("search", { path: "search" }),
        endpoint("create", { httpMethod: "post", type: "mutation" }),
        endpoint("remove", { httpMethod: "delete", path: ":id", type: "mutation" }),
      ],
    },
    {
      name: "misc",
      prefix: "v2/misc",
      filePath: "src/api.ts",
      endpoints: [endpoint("headers", { path: "/echo/headers" })],
    },
    {
      name: "live",
      prefix: "live",
      filePath: "src/api.ts",
      endpoints: [endpoint("ticks", { type: null, transport: "sse" })],
    },
  ],
};

/** The runtime hosting `api`, the name the config gives it. */
export const BOUND: BindingSnapshot = {
  rows: [
    {
      sourceName: "api",
      transport: "http",
      status: "bound",
      runtimeId: "r1",
      appOrigin: "http://localhost:7502",
    },
    {
      sourceName: "api",
      transport: "sse",
      status: "bound",
      runtimeId: "r1",
      appOrigin: "http://localhost:7502",
    },
  ],
  runtimeCount: 1,
  sourceCount: 1,
  runtimes: [{ runtimeId: "r1", kind: "server" }],
};

/**
 * A request the app made through its own instance of the source, which
 * reports the name derived from its base URL rather than the config's.
 */
export function trafficRequest(overrides: Partial<RequestEntry> = {}): RequestEntry {
  return {
    id: "req-1",
    source: "localhost",
    group: "users",
    method: "byId",
    httpMethod: "GET",
    variables: { id: 1 },
    mode: "direct",
    status: "success",
    statusCode: 200,
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 1,
    url: "http://localhost:7501/users/1",
    sessionId: "s1",
    ...overrides,
  };
}
