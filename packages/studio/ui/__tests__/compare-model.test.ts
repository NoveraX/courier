/**
 * Compare's reckoning: two texts lined up row by row with the lines that
 * changed paired, the rows numbered and narrowed to the changes, headers
 * side by side, how a figure moved, the timing phases, the comparison at a
 * glance, the ready-made pairs, the calls that can be compared, the
 * address, and the text a call's response and variables diff as.
 */
import { describe, expect, it } from "vitest";

import { comparable, pairOf } from "@/features/compare/compare-pairs";
import { validateCompareSearch } from "@/features/compare/compare-search";
import { compareSummary } from "@/features/compare/compare-summary";
import { deltaOf } from "@/features/compare/delta";
import { changeCount, diffRows } from "@/features/compare/diff-rows";
import { headerDiff } from "@/features/compare/header-diff";
import { lineDiff } from "@/features/compare/line-diff";
import { responseText, variablesText } from "@/features/compare/payload-text";
import { timingRows } from "@/features/compare/timing-rows";
import type { RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

function timed(id: string, total: number, fields: Partial<RequestEntry> = {}): RequestEntry {
  return requestEntry({
    id,
    timing: { total, middleware: 1, fetch: total - 2, validation: 1 },
    ...fields,
  });
}

describe("a line diff", () => {
  it("keeps the shared lines aligned and pairs the lines taken out and put in as changed", () => {
    const a = ["{", '  "id": "1",', '  "name": "Ada"', "}"];
    const b = ["{", '  "id": "2",', '  "name": "Alan",', '  "admin": true', "}"];

    expect(lineDiff(a, b).map((p) => [p.kind, p.a, p.b])).toEqual([
      ["same", "{", "{"],
      ["changed", '  "id": "1",', '  "id": "2",'],
      ["changed", '  "name": "Ada"', '  "name": "Alan",'],
      ["added", null, '  "admin": true'],
      ["same", "}", "}"],
    ]);
  });

  it("pairs lines up by position for texts too long to align", () => {
    const a = Array.from({ length: 2_100 }, (_, i) => `line ${i}`);
    const b = [...a.slice(0, 2_099), "last"];

    const pairs = lineDiff(a, b);

    expect(pairs).toHaveLength(2_100);
    expect(pairs.at(-1)).toEqual({ kind: "changed", a: "line 2099", b: "last" });
    expect(changeCount(pairs)).toBe(1);
  });

  it("numbers each side's lines, and keeps two unchanged lines around each change when asked", () => {
    const a = ["1", "2", "3", "4", "5", "6", "7"];
    const b = ["1", "2", "3", "4", "5", "6", "x"];
    const pairs = lineDiff(a, b);

    expect(diffRows(pairs, false)).toHaveLength(7);
    expect(diffRows(pairs, true).map((r) => r.a?.text)).toEqual(["5", "6", "7"]);
    expect(diffRows(pairs, true).at(-1)).toEqual({
      kind: "changed",
      a: { n: 7, text: "7" },
      b: { n: 7, text: "x" },
    });
  });
});

describe("the headers", () => {
  it("line up by name, saying which were added, removed, changed or stayed", () => {
    expect(
      headerDiff({ etag: "1", server: "a", age: "3" }, { etag: "2", server: "a", vary: "x" }),
    ).toEqual([
      { name: "age", a: "3", b: null, change: "removed" },
      { name: "etag", a: "1", b: "2", change: "changed" },
      { name: "server", a: "a", b: "a", change: "same" },
      { name: "vary", a: null, b: "x", change: "added" },
    ]);
  });
});

describe("how a figure moved", () => {
  it("is the same within 3%, worse when it grew, better when it shrank, and unknown from nothing", () => {
    expect(deltaOf(100, 102)).toEqual({ label: "same", direction: "same", tone: "muted" });
    expect(deltaOf(236, 1830)).toEqual({ label: "+675%", direction: "up", tone: "err" });
    expect(deltaOf(200, 150)).toEqual({ label: "−25%", direction: "down", tone: "ok" });
    expect(deltaOf(0, 10).label).toBe("—");
  });
});

describe("the timing phases", () => {
  it("compare the whole call, fetch, middleware and validation, and the proxy's trips when either was proxied", () => {
    const direct = timingRows(timed("a", 100), timed("b", 200));
    const proxied = timingRows(
      timed("a", 100),
      timed("b", 200, {
        mode: "proxy",
        proxyTiming: {
          clientToProxy: 5,
          proxyToBackend: 150,
          backendToProxy: 40,
          proxyToClient: 5,
        },
      }),
    );

    expect(direct.map((r) => r.label)).toEqual(["Total", "Fetch", "Middleware", "Validation"]);
    expect(direct[0]).toMatchObject({ a: 100, b: 200, delta: { label: "+100%" } });
    expect(proxied.map((r) => r.label).slice(4)).toEqual([
      "Client → proxy",
      "Proxy → upstream",
      "Upstream → proxy",
      "Proxy → client",
    ]);
  });
});

describe("the comparison at a glance", () => {
  it("says a call regressed or recovered, how duration and size moved, and how far apart they were", () => {
    const ok = timed("ok", 236, { size: 1_200, startedAt: 1_000_000 });
    const failed = timed("bad", 1_830, {
      status: "error",
      statusCode: 500,
      size: 4_900,
      startedAt: 1_030_220,
    });

    const [status, duration, size, apart] = compareSummary(ok, failed);

    expect(status).toMatchObject({
      a: "200",
      b: "500",
      delta: { label: "regressed", tone: "err" },
    });
    expect(compareSummary(failed, ok)[0]?.delta.label).toBe("recovered");
    expect(duration?.delta.label).toBe("+675%");
    expect(size).toMatchObject({ a: "1.2 KB", b: "4.8 KB" });
    expect(apart?.delta.label).toBe("30.22s · same endpoint");
  });
});

describe("the ready-made pairs", () => {
  const calls = [
    timed("n4", 40, { startedAt: 4 }),
    timed("e3", 900, { method: "get", status: "error", statusCode: 502, startedAt: 3 }),
    timed("g2", 80, { method: "get", startedAt: 2 }),
    timed("n1", 300, { startedAt: 1 }),
    timed("n0", 20, { startedAt: 0 }),
  ];

  it("offer a success and a failure of one endpoint, the fastest and slowest of the most varied, and the newest two", () => {
    expect(pairOf(calls, "failure")?.map((r) => r.id)).toEqual(["g2", "e3"]);
    expect(pairOf(calls, "slow")?.map((r) => r.id)).toEqual(["n0", "n1"]);
    expect(pairOf(calls, "latest")?.map((r) => r.id)).toEqual(["n1", "n4"]);
    expect(pairOf([calls[1] as RequestEntry], "latest")).toBeNull();
  });

  it("are drawn from finished HTTP calls only", () => {
    const held = [
      ...calls,
      timed("p", 10, { status: "pending" }),
      timed("x", 10, { status: "aborted" }),
      timed("s", 10, { transport: "sse", streamStatus: "complete" }),
    ];

    expect(comparable(held).map((r) => r.id)).toEqual(["n4", "e3", "g2", "n1", "n0"]);
  });
});

describe("the address", () => {
  it("keeps both requests and what is shown, the response left out as the default", () => {
    expect(validateCompareSearch({ a: "r1", b: "r2", show: "response" })).toEqual({
      a: "r1",
      b: "r2",
    });
    expect(validateCompareSearch({ a: "", show: "timing", tab: "headers" })).toEqual({
      show: "timing",
    });
  });
});

describe("what a call diffs as", () => {
  it("is its response — a text as it came — else its error, and its variables, as indented JSON", () => {
    expect(responseText(timed("a", 1, { data: { ok: true } }), 2)).toBe('{\n  "ok": true\n}');
    expect(responseText(timed("b", 1, { data: "<html>" }), 2)).toBe("<html>");
    expect(
      responseText(
        timed("c", 1, { data: undefined, error: { type: "network", message: "down" } }),
        0,
      ),
    ).toBe('{"type":"network","message":"down"}');
    expect(variablesText(timed("d", 1, { variables: { id: 7 } }), 2)).toBe('{\n  "id": 7\n}');
  });
});
