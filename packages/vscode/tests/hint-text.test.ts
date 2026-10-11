/**
 * What a hint says above a call and in its hover: the endpoint, how many
 * calls it had, how many failed and are in flight, how long they took, the
 * statuses they ended with and the latest failure — written as text, never
 * as Markdown the API's message could slip a link into.
 */
import { describe, expect, it } from "vitest";

import { formatMs, hintTitle, hoverText, studioLink } from "../src/hints/hint-text";
import { endpointPage } from "../src/studio/studio-pages";
import type { EndpointStats } from "../src/studio/studio-types";

const STATS: EndpointStats = {
  source: "shop",
  endpoint: "orders.place",
  calls: 34,
  failed: 1,
  pending: 2,
  statuses: { "201": 31, "500": 1 },
  p50: 42,
  p95: 1430,
  lastAt: 9_000,
  lastFailure: { at: 1_000, status: 500, message: "Ledger [down](https://evil.example)" },
};

describe("a hint", () => {
  it("says above a call how the endpoint's calls went, its source too when two sources share its name", () => {
    expect(hintTitle(STATS, false)).toBe(
      "orders.place · 34 calls · 1 failed · 2 in flight · p95 1.4 s",
    );
    expect(hintTitle({ ...STATS, calls: 0, failed: 0, pending: 0 }, true)).toBe(
      "shop orders.place · no calls yet",
    );
  });

  it("counts a stream's or a channel's connections, and the ones still open", () => {
    const live = { ...STATS, endpoint: "live.orders", kind: "stream" as const, statuses: {} };
    const at = (fields: Partial<EndpointStats>) =>
      hintTitle({ ...live, p95: undefined, ...fields }, false);

    expect(at({ calls: 3, failed: 1, pending: 1 })).toBe(
      "live.orders · 3 streams · 1 failed · 1 open",
    );
    expect(at({ kind: "channel", calls: 1, failed: 0, pending: 1 })).toBe(
      "live.orders · 1 channel · 1 open",
    );
    expect(at({ calls: 0, failed: 0, pending: 0 })).toBe("live.orders · no streams yet");
    expect(
      hoverText({ ...live, calls: 2, failed: 0, pending: 2 }, "http://localhost:6280", 0),
    ).toContain("2 streams, 0 failed, 2 open");
  });

  it("tells the figures in full in its hover, and the latest failure as plain text", () => {
    const text = hoverText(STATS, "http://localhost:6280", 121_000);

    expect(text).toContain("34 calls, 1 failed, 2 in flight");
    expect(text).toContain("p50 42 ms · p95 1.4 s");
    expect(text).toContain("Statuses: 201 ×31, 500 ×1");
    expect(text).toContain(
      "Last failure 2 min ago: 500 Ledger \\[down\\]\\(https://evil\\.example\\)",
    );
    expect(text).toContain(
      `[Open in Studio](${studioLink("http://localhost:6280/explorer/endpoints?endpoint=shop.orders.place")})`,
    );
  });

  it("names a failure that says no more than its status by the status and its reason", () => {
    const failure = { at: 1_000, status: 409, message: "HTTP 409" };

    const text = hoverText({ ...STATS, lastFailure: failure }, "http://localhost:6280", 28_000);

    expect(text).toContain("Last failure 27 s ago: 409 Conflict");
    expect(text).not.toContain("409 HTTP 409");
  });

  it("links the latest failure to the request Studio's inspector opens", () => {
    const failure = { at: 1_000, status: 500, message: "Ledger down", request: "req_9" };

    const text = hoverText({ ...STATS, lastFailure: failure }, "http://localhost:6280", 2_000);

    expect(text).toContain(
      `[Open in Studio](${studioLink("http://localhost:6280/explorer/endpoints?endpoint=shop.orders.place")}) · [Open the latest failure](${studioLink("http://localhost:6280/timeline?req=req_9")})`,
    );
  });

  it("writes durations as a person reads them", () => {
    expect([formatMs(0.4), formatMs(210.4), formatMs(1430)]).toEqual(["<1 ms", "210 ms", "1.4 s"]);
    expect(endpointPage("http://localhost:6280/", "shop", "live.orders")).toBe(
      "http://localhost:6280/explorer/endpoints?endpoint=shop.live.orders",
    );
  });
});

describe("a link to one of Studio's pages", () => {
  it("runs the command that opens the page where the settings say, the address its one argument", () => {
    const link = studioLink("http://localhost:6280/timeline?req=req_9");

    expect(link.startsWith("command:courier.openStudioPage?")).toBe(true);
    expect(JSON.parse(decodeURIComponent(link.split("?").slice(1).join("?")))).toEqual([
      "http://localhost:6280/timeline?req=req_9",
    ]);
  });
});
