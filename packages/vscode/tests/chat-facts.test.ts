/**
 * What @courier says of Studio's figures: the endpoints that fail first,
 * then the slowest; the failed requests with why; the audit's findings,
 * gravest first; one endpoint with its latest calls — and what an API or a
 * person wrote kept as plain text on one line.
 */
import { describe, expect, it } from "vitest";

import { auditFacts, endpointFacts, failureFacts, statusFacts } from "../src/chat/chat-facts";
import type { RecordedRequest } from "../src/studio/live-types";
import type { EndpointStats, Finding } from "../src/studio/studio-types";

const NOW = 600_000;
const stats = (endpoint: string, figures: Partial<EndpointStats> = {}): EndpointStats => ({
  source: "shop",
  endpoint,
  kind: "query",
  calls: 4,
  failed: 0,
  pending: 0,
  statuses: { "200": 4 },
  p50: 20,
  p95: 40,
  ...figures,
});
const request = (id: string, figures: Partial<RecordedRequest> = {}): RecordedRequest => ({
  id,
  source: "shop",
  endpoint: "orders.place",
  method: "POST",
  mode: "proxy",
  state: "error",
  status: 500,
  durationMs: 40,
  startedAt: NOW - 120_000,
  error: "Ledger unavailable",
  ...figures,
});

describe("the status @courier gives", () => {
  it("counts the endpoints and calls, and lists the failing ones before the slowest", () => {
    const facts = statusFacts(
      [
        stats("products.list", { p95: 30 }),
        stats("orders.place", {
          failed: 2,
          lastFailure: { at: NOW - 60_000, message: "Ledger *down*\nretry" },
        }),
        stats("search", { p95: 900 }),
        stats("orders.cancel", { calls: 0, p95: undefined }),
      ],
      NOW,
    );

    const lines = facts.split("\n");
    expect(lines[0]).toBe(
      "**4 endpoints**, 3 called, 12 calls in this session; 1 with failed calls.",
    );
    expect(lines[2]).toMatch(
      /^- `shop\.orders\.place` · .* — last failure 1 min ago: Ledger \\\*down\\\* retry$/,
    );
    expect(lines.slice(3).map((line) => line.split(" ")[1])).toEqual([
      "`shop.search`",
      "`shop.products.list`",
    ]);
  });

  it("says so when nothing was called", () => {
    expect(statusFacts([stats("orders.place", { calls: 0 })], NOW)).toBe(
      "**1 endpoint**, 0 called, 0 calls in this session; 0 with failed calls.",
    );
  });
});

describe("the failures @courier lists", () => {
  it("names each endpoint, its method, status, time and why, a pending one as pending", () => {
    const facts = failureFacts(
      [
        request("r2"),
        request("r3", {
          state: "pending",
          status: undefined,
          durationMs: undefined,
          error: undefined,
          method: undefined,
        }),
      ],
      NOW,
    );

    expect(facts).toBe(
      [
        "- `shop.orders.place` POST → 500 in 40 ms, 2 min ago: Ledger unavailable",
        "- `shop.orders.place` → pending, 2 min ago",
      ].join("\n"),
    );
  });

  it("leaves out a reason that only repeats the status", () => {
    expect(failureFacts([request("r4", { status: 404, error: "HTTP 404" })], NOW)).toBe(
      "- `shop.orders.place` POST → 404 in 40 ms, 2 min ago",
    );
  });

  it("says when none failed", () => {
    expect(failureFacts([], NOW)).toBe("No request has failed in this session.");
  });
});

describe("the audit @courier reports", () => {
  it("puts the gravest first, with the endpoints it saw and what to do", () => {
    const finding = (id: string, severity: Finding["severity"]): Finding => ({
      id,
      severity,
      title: `${severity} title`,
      description: "",
      endpoints: [{ source: "shop", endpoint: "orders.place", detail: "3 of 4 calls" }],
      ...(severity === "error" ? { suggestion: "Retry with backoff." } : {}),
    });

    const facts = auditFacts([
      finding("a", "hint"),
      finding("b", "error"),
      finding("c", "warning"),
    ]);

    expect(facts.split("\n")).toEqual([
      "- **error title** (error) at `shop.orders.place` (3 of 4 calls). Retry with backoff.",
      "- **warning title** (warning) at `shop.orders.place` (3 of 4 calls).",
      "- **hint title** (hint) at `shop.orders.place` (3 of 4 calls).",
    ]);
  });

  it("says when it found nothing", () => {
    expect(auditFacts([])).toBe("The audit found nothing to fix in this session's requests.");
  });
});

describe("one endpoint, as @courier describes it", () => {
  it("gives its figures, its latest failure and its latest calls", () => {
    const facts = endpointFacts(
      stats("orders.place", {
        failed: 1,
        lastFailure: { at: NOW - 5_000, message: "Ledger unavailable" },
      }),
      [request("r2")],
      NOW,
    );

    expect(facts.split("\n")).toEqual([
      expect.stringMatching(/^\*\*`shop\.orders\.place`\*\* · /),
      "",
      "Last failure 5 s ago: Ledger unavailable",
      "",
      "Latest calls:",
      "- POST → 500 in 40 ms, 2 min ago: Ledger unavailable",
    ]);
  });

  it("names a failure that says no more than its status by the status and its reason", () => {
    const facts = endpointFacts(
      stats("orders.place", {
        failed: 1,
        lastFailure: { at: NOW - 5_000, status: 409, message: "HTTP 409" },
      }),
      [],
      NOW,
    );

    expect(facts).toContain("Last failure 5 s ago: 409 Conflict");
  });
});
