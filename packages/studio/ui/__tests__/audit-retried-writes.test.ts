/**
 * A write that runs retry middleware with no idempotency key: Courier sends
 * it once unless the middleware sets `mutations: true`, so the audit hints
 * that a key would make its retries safe — and says nothing of a write
 * whose calls carry one.
 */
import { describe, expect, it } from "vitest";

import { runAudit } from "@/features/audit/run-audit";
import type { RequestEntry } from "@/store/types";
import type { Catalog, CatalogEndpoint } from "@/store/types-ui";

const WRITE: CatalogEndpoint = {
  type: "mutation",
  hasVariablesSchema: true,
  hasResponseSchema: true,
  middleware: ["retry"],
  origin: "scan",
};

const CATALOG: Catalog = {
  api: {
    baseURL: "https://api.example",
    groups: { orders: { prefix: "orders", endpoints: { place: WRITE, cancel: WRITE } } },
  },
};

function call(method: string, fields: Partial<RequestEntry> = {}): RequestEntry {
  return {
    id: `${method}-${fields.idempotencyKey ?? "unkeyed"}`,
    source: "api",
    group: "orders",
    method,
    httpMethod: "POST",
    type: "mutation",
    variables: { id: "7" },
    mode: "proxy",
    status: "success",
    statusCode: 200,
    middlewareCount: 1,
    middlewareEntries: [],
    hasValidation: { variables: true, response: true },
    startedAt: 1,
    sessionId: "s",
    timing: { total: 20, middleware: 1, fetch: 18, validation: 1 },
    ...fields,
  };
}

describe("a retried write", () => {
  it("is hinted at when its calls carry no idempotency key, and not when they do", () => {
    const requests = [call("place"), call("cancel", { idempotencyKey: "k-1" })];

    const finding = runAudit(requests, CATALOG, { browserSessions: new Set() }).items.find(
      (item) => item.id === "courier-retry-mutation",
    );

    expect(finding).toMatchObject({
      severity: "hint",
      category: "reliability",
      title: "Retried writes without an idempotency key",
      endpoints: [{ label: "api.orders.place" }],
    });
    expect(finding?.codeSuggestion).toContain("idempotencyKey");
  });

  it("passes once every retried write carries a key", () => {
    const requests = [
      call("place", { idempotencyKey: "k-1" }),
      call("cancel", { idempotencyKey: "k-2" }),
    ];

    const { items } = runAudit(requests, CATALOG, { browserSessions: new Set() });

    expect(items.some((item) => item.id === "courier-retry-mutation")).toBe(false);
    expect(items.find((item) => item.id === "pass-mutation-retry")?.title).toBe(
      "Retried writes carry an idempotency key",
    );
  });
});
