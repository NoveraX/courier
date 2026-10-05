/**
 * @vitest-environment jsdom
 *
 * The request a Playground run made, whose timing and headers its entry
 * takes: the one the runtime ran under the run's id, and no other call to
 * the same endpoint, however close in time.
 */
import { playgroundRequestId } from "@noverax/courier-studio-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeForRunData } from "@/playground/run-data";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types-request";

function request(id: string, statusCode: number, total: number): RequestEntry {
  return {
    id,
    source: "api",
    group: "users",
    method: "get",
    variables: { id: 2 },
    mode: "proxy",
    status: statusCode < 400 ? "success" : "error",
    statusCode,
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: true, response: true },
    startedAt: Date.now(),
    timing: { total, middleware: 0, fetch: total, validation: 0 },
    headers: { "x-served-by": id },
    sessionId: "demo-server",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useStudioStore.setState({ requests: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the request a Playground run made", () => {
  it("is the one the runtime ran under the run's id, not the app's own call", () => {
    const update = vi.fn();
    useStudioStore.setState({
      requests: [request("req_app_9", 200, 1), request(playgroundRequestId("run-1"), 500, 7)],
    });

    subscribeForRunData("entry-1", "run-1", update);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      statusCode: 500,
      timing: { total: 7 },
      responseHeaders: { "x-served-by": playgroundRequestId("run-1") },
    });
  });

  it("is taken once it arrives, after the app's own calls", () => {
    const update = vi.fn();
    subscribeForRunData("entry-1", "run-2", update);

    useStudioStore.setState({ requests: [request("req_app_10", 200, 1)] });
    useStudioStore.setState({
      requests: [request(playgroundRequestId("run-2"), 201, 4), request("req_app_10", 200, 1)],
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toMatchObject({ statusCode: 201 });
  });

  it("is none when the run failed before it sent anything", () => {
    const update = vi.fn();
    useStudioStore.setState({ requests: [request("req_app_11", 200, 1)] });

    subscribeForRunData("entry-1", "run-3", update);
    vi.advanceTimersByTime(10_000);

    expect(update).not.toHaveBeenCalled();
  });
});
