/**
 * The hints over endpoint calls, against a Studio that answers as the real
 * one does: above each call the endpoint's figures, a click opening it in
 * Studio; both sources' when two share its name; the figures in full on
 * hover; nothing for a file no Studio runs for, or once Studio stops. A
 * file's calls are asked once per version, and the figures move only when
 * Studio's do.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCallHints, type HintStyle } from "../src/hints/call-hints";
import { createHintStore } from "../src/hints/hint-store";
import { fetchCalls, fetchEndpointStats } from "../src/studio/studio-api";
import { type InlayHintLabelPart, Position, Range } from "./vscode-stand-in";

const place = { source: "shop", endpoint: "orders.place" };
let stats = [
  { ...place, calls: 3, failed: 1, pending: 0, statuses: { "201": 2, "500": 1 }, p50: 20, p95: 40 },
  {
    source: "shop",
    endpoint: "account.me",
    calls: 1,
    failed: 0,
    pending: 0,
    statuses: { "200": 1 },
    p95: 9,
  },
  { source: "payments", endpoint: "account.me", calls: 0, failed: 0, pending: 0, statuses: {} },
];
const CALLS = [
  { line: 2, column: 18, endLine: 2, endColumn: 23, endpoints: [place] },
  {
    line: 3,
    column: 15,
    endLine: 3,
    endColumn: 17,
    endpoints: [
      { source: "shop", endpoint: "account.me" },
      { source: "payments", endpoint: "account.me" },
    ],
  },
  {
    line: 4,
    column: 9,
    endLine: 4,
    endColumn: 12,
    endpoints: [{ source: "shop", endpoint: "gone" }],
  },
];
const asked: string[] = [];
let server: Server;
let studio: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    asked.push(req.url ?? "");
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(req.url === "/api/editor/calls" ? { calls: CALLS } : { endpoints: stats }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  studio = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

function document(version: number, file = "/work/shop/src/cart.ts") {
  return {
    uri: { scheme: "file", fsPath: file },
    version,
    getText: () => "// cart\n…",
    lineAt: (line: number) => ({ range: { end: new Position(line, 40) } }),
  };
}

const token = { isCancellationRequested: false };

function hintsFor(found: () => string | undefined, style: HintStyle = "codeLens") {
  const store = createHintStore({
    findStudio: async () => found(),
    fetchStats: fetchEndpointStats,
    fetchCalls,
  });
  return {
    store,
    hints: createCallHints(
      store,
      () => true,
      () => style,
    ),
  };
}

describe("the hints over endpoint calls", () => {
  it("show each call's endpoint figures above it, both sources' when two share its name, a click opening Studio", async () => {
    const { hints } = hintsFor(() => studio);

    const lenses = (await hints.provideCodeLenses(document(1) as never, token as never)) ?? [];

    expect(lenses.map((lens) => lens.command?.title)).toEqual([
      "orders.place · 3 calls · 1 failed · p95 40 ms",
      "shop account.me · 1 call · p95 9 ms",
      "payments account.me · no calls yet",
    ]);
    expect(lenses[0]?.command).toMatchObject({
      command: "courier.openInStudio",
      arguments: [studio, "shop", "orders.place"],
    });
    expect(lenses[0]?.range.start).toEqual({ line: 1, character: 17 });
  });

  it("put the figures at the end of each call's line instead, when the settings say so", async () => {
    const { hints } = hintsFor(() => studio, "inlay");
    const all = new Range(0, 0, 99, 0);

    const lenses = await hints.provideCodeLenses(document(1) as never, token as never);
    const inlays =
      (await hints.provideInlayHints(document(1) as never, all as never, token as never)) ?? [];
    const [first] = inlays;
    const [part] = (first?.label ?? []) as InlayHintLabelPart[];

    expect(lenses).toEqual([]);
    expect(inlays.map((hint) => (hint.label as InlayHintLabelPart[])[0]?.value)).toEqual([
      "orders.place · 3 calls · 1 failed · p95 40 ms",
      "shop account.me · 1 call · p95 9 ms",
      "payments account.me · no calls yet",
    ]);
    expect(first?.position).toEqual({ line: 1, character: 40 });
    expect(part?.command).toMatchObject({
      command: "courier.openInStudio",
      arguments: [studio, "shop", "orders.place"],
    });
    expect(String((part?.tooltip as { value: string } | undefined)?.value)).toContain(
      "3 calls, 1 failed",
    );
  });

  it("tell the figures in full over a call", async () => {
    const { hints } = hintsFor(() => studio);

    const hover = await hints.provideHover(
      document(1) as never,
      new Position(1, 19) as never,
      token as never,
    );

    const text = (hover?.contents ?? []).map((c) => (typeof c === "string" ? c : c.value)).join("");

    expect(text).toContain("3 calls, 1 failed");
  });

  it("show nothing for a file no Studio runs for, nor once Studio stops", async () => {
    const none = hintsFor(() => undefined);
    const stopped = hintsFor(() => "http://127.0.0.1:9");

    expect(await none.hints.provideCodeLenses(document(1) as never, token as never)).toEqual([]);
    expect(await stopped.hints.provideCodeLenses(document(1) as never, token as never)).toEqual([]);
    expect(await stopped.store.answers("http://127.0.0.1:9")).toBe(false);
  });

  it("ask for a file's calls once per version, and move only when Studio's figures do", async () => {
    const { store } = hintsFor(() => studio);
    asked.length = 0;
    const doc = { file: "/work/shop/src/cart.ts", text: "x", workspace: "/work" };

    await store.callsIn({ ...doc, version: 1 });
    await store.callsIn({ ...doc, version: 1 });
    await store.callsIn({ ...doc, version: 2 });
    const quiet = await store.refresh();
    stats = stats.map((s) => (s.endpoint === "orders.place" ? { ...s, calls: 4 } : s));
    const moved = await store.refresh();

    expect(asked.filter((url) => url === "/api/editor/calls")).toHaveLength(2);
    expect([quiet, moved]).toEqual([false, true]);
    expect(store.statsOf(studio, "shop", "orders.place")?.calls).toBe(4);
  });
});
