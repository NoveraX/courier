/**
 * What the inspector shows of a request before its tabs' content: the tabs
 * themselves — the failure right after the overview, the messages for a
 * stream — which one opens, the properties, the four figures, and what an
 * address says of the request open in it.
 */
import { describe, expect, it } from "vitest";

import { validateInspectorSearch } from "@/features/requests/inspector-search";
import { inspectorTabsOf, shownTab } from "@/features/requests/inspector-tabs";
import { requestProperties } from "@/features/requests/request-properties";
import { statCellsOf } from "@/features/requests/stat-cells";
import { requestEntry } from "./request-entry-fixture";

const ok = requestEntry({
  headers: { "content-type": "application/json; charset=utf-8" },
  size: 4_600,
});
const failed = requestEntry({
  status: "validation_error",
  error: { type: "validation", message: "x" },
});
const stream = requestEntry({ transport: "sse", streamStatus: "streaming", streamEventCount: 7 });

describe("the inspector's tabs", () => {
  it("are the overview, the answer, the request, the headers, the timing and the snippets for HTTP", () => {
    expect(inspectorTabsOf(ok).map((t) => t.label)).toEqual([
      "Overview",
      "Response",
      "Request",
      "Headers",
      "Timing",
      "Snippets",
    ]);
    expect(inspectorTabsOf(ok).find((t) => t.key === "headers")?.count).toBe(1);
  });

  it("put the failure right after the overview, named for its kind", () => {
    expect(inspectorTabsOf(failed).slice(0, 2)).toEqual([
      { key: "overview", label: "Overview", alert: false },
      { key: "failure", label: "Validation", alert: true },
    ]);
  });

  it("show a stream's messages, counted, in place of the answer and the timing", () => {
    expect(inspectorTabsOf(stream).map((t) => [t.key, t.count])).toEqual([
      ["overview", undefined],
      ["messages", 7],
      ["headers", 0],
      ["snippets", undefined],
    ]);
  });

  it("open on the one asked for when the request has it, else the failure, the messages or the overview", () => {
    expect(shownTab(ok, "timing")).toBe("timing");
    expect(shownTab(stream, "timing")).toBe("messages");
    expect(shownTab(failed, undefined)).toBe("failure");
    expect(shownTab(ok, undefined)).toBe("overview");
  });
});

describe("the properties", () => {
  it("name the endpoint, the request, its app and when it started, and the operation", () => {
    const properties = requestProperties(ok, { runtimeKind: "browser" });

    expect(properties.map((p) => [p.label, p.value])).toEqual([
      ["Endpoint", "api.users.list"],
      ["Request ID", "r1"],
      ["Runtime", "vite-browser · browser"],
      ["Started at", expect.stringMatching(/^\d\d:\d\d:\d\d\.\d{3}$/)],
      ["Operation", "Query"],
    ]);
  });

  it("name the saved session shown, the cache's part, and a stream's protocol", () => {
    const cached = requestEntry({ type: "mutation", cache: { hit: false } });

    expect(
      requestProperties(cached, { sessionName: "Before the fix" }).map((p) => p.value),
    ).toContain("Before the fix");
    expect(requestProperties(cached, {}).at(-1)?.value).toBe("Mutation · not in the cache");
    expect(requestProperties(stream, {}).at(-1)).toEqual({
      label: "Protocol",
      value: "text/event-stream",
      mono: true,
    });
    expect(requestProperties(ok, {})[2]?.value).toBe("vite-browser");
    expect(
      requestProperties(requestEntry({ sessionId: "server" }), { runtimeKind: "server" })[2]?.value,
    ).toBe("server");
  });
});

describe("the four figures", () => {
  const context = { now: ok.startedAt + 30_000, slowMs: 500, p95: 153 };

  it("are the status, the duration against the p95, the size and its kind, and the start", () => {
    const [status, duration, size, started] = statCellsOf(ok, context);

    expect(status).toMatchObject({
      value: "Success",
      sub: "HTTP 200",
      dot: { tone: "ok", pulse: false },
    });
    expect(duration).toMatchObject({
      label: "Duration",
      value: "120ms",
      sub: "p95 153ms",
      tone: "normal",
    });
    expect(size).toMatchObject({ value: "4.5 KB", sub: "json" });
    expect(started).toMatchObject({ label: "Started", sub: "30s ago" });
  });

  it("for a stream are how long it has been open and its messages", () => {
    const [status, open, messages] = statCellsOf(stream, {
      ...context,
      now: stream.startedAt + 5_000,
    });

    expect(status).toMatchObject({
      value: "Streaming",
      sub: "SSE · 200",
      dot: { tone: "brand", pulse: true },
    });
    expect(open).toMatchObject({ label: "Open for", value: "5.00s", sub: "live" });
    expect(messages).toMatchObject({ label: "Messages", value: "7" });
  });

  it("wait while the request is in flight", () => {
    const pending = requestEntry({ status: "pending", timing: undefined, statusCode: undefined });

    expect(statCellsOf(pending, context)[1]?.value).toBe("···");
    expect(statCellsOf(pending, context)[0]?.sub).toBe("in flight");
  });
});

describe("an address under the new shell", () => {
  it("names the request open in the inspector, and its tab when it is one", () => {
    expect(validateInspectorSearch({ req: "r1", tab: "timing" })).toEqual({
      req: "r1",
      tab: "timing",
    });
    expect(validateInspectorSearch({ req: "", tab: "everything" })).toEqual({});
  });
});
