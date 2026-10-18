/**
 * A call whose read another call's request answered sent nothing over the
 * network: a saved session keeps it, marked, and counts it among its calls
 * alone, while a HAR and a Postman
 * collection — what the network carried, and what to send again — leave
 * it out; an editor's latency figures take the requests alone, counting
 * every call; and an agent is told how it was answered, and how many calls
 * and requests its audit read.
 */
import { describe, expect, it } from "vitest";

import { requestFromSaved, savedRequestOf } from "@/features/sessions/saved-request";
import { endpointStats } from "../src/server/editor/endpoint-stats";
import { auditTool } from "../src/server/mcp/audit-tool";
import { gatherRequests, summaryOf } from "../src/server/mcp/request-views";
import { buildSession } from "../src/server/session-builder";
import { exportAsHar } from "../src/server/session-export-har";
import { exportAsPostman } from "../src/server/session-export-postman";
import { requestEntry } from "../ui/__tests__/request-entry-fixture";

const SHARED = { by: "flight", with: "sent" } as const;

function session() {
  return buildSession({
    requests: [
      {
        id: "sent",
        source: "shop",
        method: "list",
        startedAt: 1,
        httpMethod: "GET",
        url: "https://api.example.com/items",
      },
      {
        id: "joined",
        source: "shop",
        method: "list",
        startedAt: 2,
        httpMethod: "GET",
        url: "https://api.example.com/items",
        shared: SHARED,
      },
      { id: "odd", source: "shop", method: "list", startedAt: 3, shared: { by: "cache" } },
    ],
    apps: [],
  });
}

function events(requestId: string, total: number, shared?: unknown) {
  const start = {
    type: "request:start",
    id: requestId,
    requestId,
    source: "shop",
    method: "list",
    mode: "direct",
    timestamp: 1,
  };
  const end = {
    type: "request:end",
    id: `${requestId}:end`,
    requestId,
    status: 200,
    timing: { total, middleware: 0, fetch: total, validation: 0 },
    timestamp: 2,
    ...(shared !== undefined && { shared }),
  };
  return [start, end];
}

describe("a saved session", () => {
  it("keeps how a call's read was shared, and nothing in another shape", () => {
    expect(session().requests.map((request) => request.shared)).toEqual([
      undefined,
      SHARED,
      undefined,
    ]);
  });

  it("exports to a HAR and a Postman collection only the calls that sent a request", () => {
    const saved = session();

    expect(exportAsHar(saved).log.entries).toHaveLength(2);
    expect(exportAsPostman(saved).item).toHaveLength(2);
  });
});

describe("a saved session's figures", () => {
  it("count the requests sent, their failures, time and bytes, and every call beside them", () => {
    const saved = buildSession({
      requests: [
        {
          id: "sent",
          source: "shop",
          method: "list",
          startedAt: 1,
          status: "error",
          size: 900,
          timing: { total: 400, middleware: 0, fetch: 400, validation: 0 },
        },
        {
          id: "joined",
          source: "shop",
          method: "list",
          startedAt: 2,
          status: "error",
          size: 900,
          timing: { total: 30, middleware: 0, fetch: 30, validation: 0 },
          shared: SHARED,
        },
        {
          id: "ok",
          source: "shop",
          method: "get",
          startedAt: 3,
          status: "success",
          size: 100,
          timing: { total: 100, middleware: 0, fetch: 100, validation: 0 },
        },
      ],
      apps: [],
    });

    expect(saved.stats).toEqual({
      totalRequests: 2,
      totalCalls: 3,
      successCount: 1,
      errorCount: 1,
      avgDuration: 250,
      totalSize: 1000,
    });
  });
});

describe("a session the page saves", () => {
  it("keeps each call's mark, agent and idempotency key, through Studio's server and back", () => {
    const agent = { tool: "list_items", access: "read", client: "code-editor 2.1.0" } as const;
    const sent = requestEntry({ id: "sent", agent, idempotencyKey: "key-1" });
    const joined = requestEntry({ id: "joined", shared: SHARED });

    const saved = buildSession({ requests: [sent, joined].map(savedRequestOf), apps: [] });
    const back = saved.requests.map(requestFromSaved);

    expect(back.map((request) => request?.shared)).toEqual([undefined, SHARED]);
    expect(back[0]).toMatchObject({ agent, idempotencyKey: "key-1" });
    expect(exportAsHar(saved).log.entries).toHaveLength(1);
  });
});

describe("an editor's figures for an endpoint", () => {
  it("count every call, and take the latency, statuses and failures from the requests alone", () => {
    const failed = (requestId: string, shared?: unknown) => [
      {
        type: "request:start",
        id: requestId,
        requestId,
        source: "shop",
        method: "list",
        mode: "direct",
        timestamp: 3,
      },
      {
        type: "request:error",
        id: `${requestId}:error`,
        requestId,
        error: { type: "http", status: 502, message: "Bad gateway" },
        status: 502,
        timestamp: 4,
        ...(shared !== undefined && { shared }),
      },
    ];
    const [stats] = endpointStats(
      [
        ...events("sent", 400),
        ...events("joined", 30, SHARED),
        ...failed("broke"),
        ...failed("waited", { by: "flight", with: "broke" }),
      ],
      [{ source: "shop", endpoint: "list", parts: ["list"], kind: "query" }],
    );

    expect(stats).toMatchObject({
      calls: 4,
      requests: 2,
      failed: 1,
      statuses: { "200": 1, "502": 1 },
      p50: 400,
      p95: 400,
      lastFailure: { request: "broke" },
    });
  });
});

describe("an agent", () => {
  it("is told how many calls the audit read and how many requests they sent", async () => {
    const tool = auditTool({
      requestLog: {
        events: () =>
          [...events("sent", 400), ...events("joined", 30, SHARED)].map((event) => ({
            ...event,
            sessionId: "app",
          })),
      },
      declared: () => [],
      runtimes: () => [],
    });

    const outcome = await tool.run({}, { signal: new AbortController().signal });

    expect(outcome).toMatchObject({ ok: true, data: { calls: 2, requests: 1 } });
  });

  it("is told how a call's read was shared", () => {
    const gathered = gatherRequests([...events("sent", 400), ...events("joined", 30, SHARED)]);
    const joined = gathered.get("joined");
    const sent = gathered.get("sent");
    if (!joined || !sent) throw new Error("the requests were not gathered");

    expect(summaryOf("joined", joined).shared).toEqual(SHARED);
    expect(summaryOf("sent", sent).shared).toBeUndefined();
  });

  it("is told how a failed call's read was shared", () => {
    const gathered = gatherRequests([
      {
        type: "request:start",
        id: "broke",
        requestId: "broke",
        source: "shop",
        method: "list",
        mode: "direct",
        timestamp: 1,
      },
      {
        type: "request:start",
        id: "waited",
        requestId: "waited",
        source: "shop",
        method: "list",
        mode: "direct",
        timestamp: 2,
      },
      {
        type: "request:error",
        id: "e1",
        requestId: "broke",
        status: 502,
        error: { message: "Bad gateway" },
        timestamp: 3,
      },
      {
        type: "request:error",
        id: "e2",
        requestId: "waited",
        status: 502,
        error: { message: "Bad gateway" },
        timestamp: 4,
        shared: { by: "flight", with: "broke" },
      },
    ]);
    const waited = gathered.get("waited");
    const broke = gathered.get("broke");
    if (!waited || !broke) throw new Error("the requests were not gathered");

    expect(summaryOf("waited", waited)).toMatchObject({
      state: "error",
      shared: { by: "flight", with: "broke" },
    });
    expect(summaryOf("broke", broke).shared).toBeUndefined();
  });
});
