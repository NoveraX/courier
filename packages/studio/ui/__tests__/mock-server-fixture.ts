import type { MockRequestLog, MockServerInfo } from "@/store/mock-slice";

/**
 * A mock server as Studio holds it — a running one Studio manages, with no
 * routes, data or scenarios — with the fields a test names in place.
 *
 * @param fields - The fields that differ
 * @returns The server
 */
export function mockServer(fields: Partial<MockServerInfo> = {}): MockServerInfo {
  return {
    serverId: "api-mock",
    name: "api-mock",
    port: 7001,
    url: "http://localhost:7001",
    status: "connected",
    startedAt: 1,
    routeCount: 0,
    collectionCount: 0,
    recordCount: 0,
    requestsServed: 0,
    scenarioRequestCount: 0,
    errorCount: 0,
    activeScenario: null,
    availableScenarios: [],
    networkPreset: "none",
    networkConfig: null,
    latencyPreset: "none",
    chaosPreset: "none",
    managed: true,
    processStatus: "running",
    origin: "studio",
    collections: [],
    storeSeq: 0,
    routes: [],
    scenarios: [],
    ...fields,
  };
}

/**
 * A request a mock answered — a 200 for `GET /api/users` in 12ms — with the
 * fields a test names in place.
 *
 * @param fields - The fields that differ
 * @returns The logged request
 */
export function mockLog(fields: Partial<MockRequestLog> = {}): MockRequestLog {
  return {
    id: "log-1",
    serverId: "api-mock",
    timestamp: 1,
    httpMethod: "get",
    path: "/api/users",
    group: "users",
    endpoint: "list",
    status: 200,
    duration: 12,
    ...fields,
  };
}
