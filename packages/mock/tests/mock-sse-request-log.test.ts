/**
 * An SSE request on the mock server is logged as finished once its stream
 * has ended.
 *
 * The stream branch reported the request's start and never its end, so in
 * Studio's mock Logs every stream stayed pending, without a status or a
 * duration.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockServer } from "../src/server/create-mock-server";

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

describe("an SSE request's log entry", () => {
  it("ends with status 200 and a duration when the stream completes", async () => {
    const server = createMockServer({ port: 0, log: false });
    running.push(server);
    server.mock("live", "ticker").emits([{ data: { n: 1 } }, { data: { n: 2 } }]);
    const onStart = vi.fn();
    const onEnd = vi.fn();
    server.requestHooks.onStart = onStart;
    server.requestHooks.onEnd = onEnd;
    const { url } = await server.start();

    await (await fetch(`${url}/api/live/ticker`)).text();

    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
    const [startedId] = onStart.mock.calls[0] ?? [];
    const [endedId, status, data, duration] = onEnd.mock.calls[0] ?? [];
    expect(endedId).toBe(startedId);
    expect(status).toBe(200);
    expect(data).toEqual({ events: 2 });
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it("ends as an error when the stream fails", async () => {
    const server = createMockServer({ port: 0, log: false });
    running.push(server);
    server.mock("live", "ticker").stream(async function* () {
      yield { data: 1 };
      throw new Error("feed dropped");
    });
    const onError = vi.fn();
    server.requestHooks.onError = onError;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { url } = await server.start();

    await (await fetch(`${url}/api/live/ticker`)).text();

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]?.slice(1, 3)).toEqual([500, "feed dropped"]);
    warn.mockRestore();
  });
});
