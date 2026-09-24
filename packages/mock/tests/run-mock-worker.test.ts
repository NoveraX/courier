/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MockDefinitionLoader } from "../src/managed/run-mock-worker";
import { runMockWorker } from "../src/managed/run-mock-worker";
import type { ParentMessage } from "../src/managed/types";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The worker's IPC listeners, captured instead of registered on the test
 * process; delivering a message to a worker that registered no listener for
 * one is a broken setup, not an outcome under test, so it throws.
 */
function captureListeners(): (message: ParentMessage) => void {
  const on = vi.spyOn(process, "on").mockImplementation(() => process);
  vi.spyOn(process, "once").mockImplementation(() => process);
  return (message) => {
    const registered = on.mock.calls.find(([event]) => event === "message");
    if (registered === undefined) throw new Error("runMockWorker registered no message listener");
    registered[1](message);
  };
}

describe("runMockWorker", () => {
  it("hands the loader the transform directory Studio names in the start message", () => {
    const deliver = captureListeners();
    const loader = vi.fn<MockDefinitionLoader>(() => new Promise<unknown>(() => undefined));
    runMockWorker(loader);

    deliver({
      type: "start",
      mocksFile: "/app/courier.mocks.ts",
      mockKey: "apiMock",
      port: 7401,
      transformCacheDirectory: "/app/node_modules/.cache/courier/transform",
    });

    expect(loader).toHaveBeenCalledWith(
      "/app/courier.mocks.ts",
      "apiMock",
      "/app/node_modules/.cache/courier/transform",
    );
  });

  it("hands the loader no directory when Studio keeps none", () => {
    const deliver = captureListeners();
    const loader = vi.fn<MockDefinitionLoader>(() => new Promise<unknown>(() => undefined));
    runMockWorker(loader);

    deliver({
      type: "start",
      mocksFile: "/app/courier.mocks.ts",
      mockKey: "apiMock",
      port: 7401,
      transformCacheDirectory: null,
    });

    expect(loader).toHaveBeenCalledWith("/app/courier.mocks.ts", "apiMock", null);
  });
});
