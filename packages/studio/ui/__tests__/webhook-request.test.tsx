/**
 * @vitest-environment jsdom
 *
 * A webhook delivered to the app, in Studio: kept as a webhook from its
 * event and from a saved session, chosen by the Mode filter, marked in its
 * Timeline row; told in its own parts — its signature, its body, its
 * handler — where it stopped and what fixes it, its time as its checks and
 * its handler — on the Waterfall too, outside the calls' time in fetch;
 * written out as a mock delivers it again; left out of the Audit — and
 * never replayed from Studio, since its sender, not the app, made it.
 */
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/inspector/use-inspector", () => ({ useInspector: () => ({ open: vi.fn() }) }));

import { runAudit } from "@/features/audit/run-audit";
import { requestChecks } from "@/features/requests/request-checks";
import { failureOf } from "@/features/requests/request-failure";
import { requestProperties } from "@/features/requests/request-properties";
import { requestSnippet } from "@/features/requests/request-snippets";
import { dimensionValue, matchesFilter, OPEN_FILTER } from "@/features/requests/timeline-filter";
import { timingPhasesOf } from "@/features/requests/timing-phases";
import { requestFromSaved } from "@/features/sessions/saved-request";
import { barOf } from "@/features/waterfall/bar-segments";
import { waterfallInsights } from "@/features/waterfall/waterfall-insights";
import { useReplay } from "@/inspector/use-replay";
import { RequestRow } from "@/screens/timeline/request-row";
import { requestFromStart } from "@/store/handle-request-events";
import { requestEntry } from "./request-entry-fixture";

const start = {
  id: "w1",
  type: "request:start",
  source: "stripe",
  method: "invoice.paid",
  mode: "webhook",
  middlewareCount: 0,
  timestamp: 1,
};

describe("a webhook delivery", () => {
  it("is kept as a webhook from its event and from a saved session", () => {
    expect(requestFromStart(start).mode).toBe("webhook");
    expect(requestFromSaved({ ...start, startedAt: 1 })?.mode).toBe("webhook");
    expect(requestFromStart({ ...start, mode: "elsewhere" }).mode).toBe("direct");
  });

  it("is chosen by the Mode filter as Webhook, and marked in its row", () => {
    const delivered = requestEntry({ mode: "webhook", source: "stripe", method: "invoice.paid" });
    const webhooks = { ...OPEN_FILTER, selected: { ...OPEN_FILTER.selected, mode: ["webhook"] } };

    expect(dimensionValue(delivered, "mode")).toBe("webhook");
    expect([
      matchesFilter(delivered, webhooks, { slowMs: 500 }),
      matchesFilter(requestEntry({}), webhooks, { slowMs: 500 }),
    ]).toEqual([true, false]);
    render(
      <RequestRow
        request={delivered}
        selected={false}
        context={{ now: 2, slowMs: 500, timestamps: "relative", wide: true }}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("webhook")).toBeTruthy();
  });

  it("is not replayed from Studio", () => {
    const { result } = renderHook(() => useReplay());

    const replay = result.current(requestEntry({ mode: "webhook" }));

    expect(replay.run).toBeUndefined();
    expect(replay.title).toMatch(/deliver it again from a mock/);
  });

  it("names its webhook and event, and checks its signature, its body and its handler — not a call's schemas", () => {
    const delivered = requestEntry({
      mode: "webhook",
      source: "stripe",
      group: undefined,
      method: "invoice.paid",
      variables: { id: "evt_1", type: "invoice.paid" },
      statusCode: 204,
      timing: { total: 12, middleware: 0, fetch: 0, validation: 2 },
    });

    const properties = requestProperties(delivered, {});

    expect(properties.slice(0, 2)).toEqual([
      { label: "Webhook", value: "stripe", mono: true },
      { label: "Event", value: "invoice.paid", mono: true },
    ]);
    expect(properties.map((p) => p.label)).not.toContain("Operation");
    expect(requestChecks(delivered).map((c) => [c.label, c.state])).toEqual([
      ["Signature matched", "ok"],
      ["Body passed the schema", "ok"],
      ["Handler answered", "ok"],
    ]);
    expect(timingPhasesOf(delivered)?.phases.map((p) => [p.label, p.duration])).toEqual([
      ["Checks", 2],
      ["Handler", 10],
    ]);
  });

  it("says where a refused delivery stopped and what fixes it, by how it was refused", () => {
    const refused = (statusCode: number, variables?: unknown) =>
      requestEntry({
        mode: "webhook",
        status: statusCode === 422 ? "validation_error" : "error",
        statusCode,
        variables,
        error: { type: statusCode === 422 ? "validation" : "http", message: "refused" },
        timing: { total: 3, middleware: 0, fetch: 0, validation: 3 },
      });

    const signature = failureOf(refused(401));
    const secret = failureOf(refused(500));
    const handler = failureOf(refused(500, { id: "evt_1" }));
    const schema = failureOf(refused(422, { id: 1 }));

    expect(signature?.stages.map((s) => [s.label, s.state])).toEqual([
      ["Signature", "err"],
      ["Body", "skip"],
      ["Handler", "skip"],
    ]);
    expect(signature?.hint).toMatch(/signing secret from the sender's dashboard/);
    expect(secret?.where).toBe(
      "Refused before your handler ran: the webhook could not check the signature",
    );
    expect(handler?.where).toBe("Your handler failed after 3.0ms");
    expect(handler?.hint).not.toMatch(/retry middleware/);
    expect(schema?.stages[1]).toMatchObject({ label: "Body", state: "err" });
    expect(timingPhasesOf(refused(401))?.phases.map((p) => p.label)).toEqual(["Checks"]);
  });

  it("is written out as a mock delivers it again, signed with the webhook's own secret", () => {
    const delivered = requestEntry({
      mode: "webhook",
      source: "stripe",
      url: "http://127.0.0.1:3000/webhooks/stripe",
      variables: { id: "evt_1" },
    });

    const code = requestSnippet(delivered, "courier").code;

    expect(code).toContain('import { deliverWebhook } from "@noverax/courier-mock"');
    expect(code).toContain("await deliverWebhook(stripe, {");
    expect(code).toContain('to: "http://127.0.0.1:3000/webhooks/stripe",');
    expect(code).toContain('id: "evt_1"');
  });

  it("is left out of the Audit, which weighs the calls the app makes", () => {
    const failing = requestEntry({
      mode: "webhook",
      status: "error",
      statusCode: 500,
      error: { type: "http", message: "The webhook's handler failed" },
    });

    const audit = runAudit([failing, { ...failing, id: "r2" }], {}, { browserSessions: new Set() });

    expect(audit.items.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("draws its bar as its checks and its handler, outside the calls' time in fetch", () => {
    const delivered = requestEntry({
      mode: "webhook",
      statusCode: 204,
      variables: { id: "evt_1" },
      timing: { total: 10, middleware: 0, fetch: 0, validation: 4 },
    });
    const call = requestEntry({
      id: "r2",
      timing: { total: 100, middleware: 0, fetch: 80, validation: 0 },
    });
    const bar = barOf(delivered, 0);

    const insights = waterfallInsights(
      [
        { request: delivered, bar },
        { request: call, bar: barOf(call, 0) },
      ],
      { start: 0, end: 100, gaps: [] },
    );

    expect(bar.segments.map((s) => [s.key, s.duration])).toEqual([
      ["checks", 4],
      ["handler", 6],
    ]);
    expect(insights.fetchShare).toBeCloseTo(0.8);
  });
});
