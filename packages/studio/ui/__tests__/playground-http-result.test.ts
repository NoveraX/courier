/**
 * @vitest-environment jsdom
 */
/**
 * What the Playground shows for an HTTP request it ran.
 *
 * Its Timing and Headers tabs were always empty: the timing was looked up
 * only for a proxy-mode request, and only among proxy requests, while the
 * runtime runs every Playground request in-process, where it is reported as
 * direct. An error answer showed a message lifted out of its body instead of
 * the body.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());

vi.mock("@/socket", () => ({ getSocket: () => ({ emit }) }));

import { useStudioStore } from "../src/store";
import type { StudioEvent } from "../src/store/types";
import type { PlaygroundHistoryEntry } from "../src/store/types-ui";
import { initiateHttpRequest } from "../src/views/playground/send-http-request";

afterEach(() => {
  useStudioStore.getState().clearPlaygroundHistory();
  useStudioStore.setState({ requests: [] });
  emit.mockClear();
});

function send(mode: "direct" | "proxy"): PlaygroundHistoryEntry {
  const entry: PlaygroundHistoryEntry = {
    id: `entry-${mode}`,
    rid: `rid-${mode}`,
    source: "api",
    group: "users",
    method: "create",
    variables: '{"name":"zed"}',
    headers: "{}",
    mode,
    timestamp: Date.now(),
    status: "pending",
  };
  const { addPlaygroundEntry, updatePlaygroundEntry } = useStudioStore.getState();
  addPlaygroundEntry(entry);
  initiateHttpRequest({
    id: entry.id,
    rid: entry.rid,
    payload: { ...entry, mode },
    values: { variables: { name: "zed" }, headers: {} },
    sentAt: entry.timestamp,
    updateEntry: updatePlaygroundEntry,
    setSending: () => {},
  });
  return entry;
}

type Event = StudioEvent & Record<string, unknown>;

/** The runtime's report of the run, as it reaches the UI: in-process, so direct. */
function reportRun(): void {
  const { handleEvents } = useStudioStore.getState();
  const start: Event = {
    id: "req-1",
    sessionId: "app",
    type: "request:start",
    timestamp: Date.now(),
    source: "api",
    group: "users",
    method: "create",
    mode: "direct",
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
  };
  const end: Event = {
    id: "req-1",
    sessionId: "app",
    type: "request:end",
    requestId: "req-1",
    timestamp: Date.now(),
    status: 201,
    data: { id: 3 },
    size: 8,
    headers: { location: "/users/3" },
    requestHeaders: {},
    timing: { total: 12, middleware: 0, fetch: 10, validation: 1 },
  };
  handleEvents([start, end]);
}

function entryOf(rid: string): PlaygroundHistoryEntry | undefined {
  return useStudioStore.getState().playgroundHistory.find((entry) => entry.rid === rid);
}

describe("an HTTP request run from the Playground", () => {
  it.each(["direct", "proxy"] as const)("shows its timing in %s mode", (mode) => {
    const entry = send(mode);
    reportRun();

    expect(entryOf(entry.rid)?.timing?.total).toBe(12);
    expect(entryOf(entry.rid)?.responseHeaders).toEqual({ location: "/users/3" });
  });

  it("shows the body of an error answer, and its headers", () => {
    const entry = send("direct");
    useStudioStore.getState().appendPlaygroundChunk(entry.rid, {
      kind: "http-result",
      status: 404,
      error: "HTTP 404",
      data: { message: "nope" },
      headers: { "x-upstream": "yes" },
    });

    expect(entryOf(entry.rid)?.statusCode).toBe(404);
    expect(entryOf(entry.rid)?.response).toEqual({ message: "nope" });
    expect(entryOf(entry.rid)?.responseHeaders).toEqual({ "x-upstream": "yes" });
  });

  it("shows what went wrong when the answer had no body", () => {
    const entry = send("direct");
    useStudioStore.getState().appendPlaygroundChunk(entry.rid, {
      kind: "http-result",
      status: 500,
      error: "middleware exploded",
    });

    expect(entryOf(entry.rid)?.response).toBe("middleware exploded");
  });
});
