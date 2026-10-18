/**
 * A call whose read another call's request answered sent nothing over the
 * network: a saved session keeps it, marked, while a HAR and a Postman
 * collection — what the network carried, and what to send again — leave
 * it out; an editor's latency figures take the requests alone, counting
 * every call; and an agent is told how it was answered.
 */
import { describe, expect, it } from "vitest";

import { requestFromSaved, savedRequestOf } from "@/features/sessions/saved-request";
import { endpointStats } from "../src/server/editor/endpoint-stats";
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
  it("count every call, and take the latency from the requests alone", () => {
    const [stats] = endpointStats(
      [...events("sent", 400), ...events("joined", 30, SHARED)],
      [{ source: "shop", endpoint: "list", parts: ["list"], kind: "query" }],
    );

    expect(stats).toMatchObject({ calls: 2, p50: 400, p95: 400 });
  });
});

describe("an agent", () => {
  it("is told how a call's read was shared", () => {
    const gathered = gatherRequests([...events("sent", 400), ...events("joined", 30, SHARED)]);
    const joined = gathered.get("joined");
    const sent = gathered.get("sent");
    if (!joined || !sent) throw new Error("the requests were not gathered");

    expect(summaryOf("joined", joined).shared).toEqual(SHARED);
    expect(summaryOf("sent", sent).shared).toBeUndefined();
  });
});
