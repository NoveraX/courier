/**
 * @vitest-environment jsdom
 */
/**
 * What the Playground shows for an HTTP request it ran: the timing and
 * headers of the request the runtime ran under the run's id, in either mode,
 * and an error answer's body rather than a message lifted out of it.
 */
import { playgroundRequestId } from "@noverax/courier-studio-core";
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
    updateEntry: updatePlaygroundEntry,
    setSending: () => {},
  });
  return entry;
}

type Event = StudioEvent & Record<string, unknown>;

/** The runtime's report of the run, under the run's id, as it reaches the UI. */
function reportRun(rid: string): void {
  const { handleEvents } = useStudioStore.getState();
  const id = playgroundRequestId(rid);
  const start: Event = {
    id,
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
    id,
    sessionId: "app",
    type: "request:end",
    requestId: id,
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
    reportRun(entry.rid);

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
