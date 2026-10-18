/**
 * @vitest-environment jsdom
 *
 * The toasts a batch of events brings, a toast a request: a read another
 * call's request answered is told with that request — a failed one says
 * how many calls it failed — never on its own, and never as slow for a
 * wait on another call's request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const toasts = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

import { useStudioStore } from "@/store";
import { notifyOnEvents } from "@/store/event-notifications";
import { requestEntry } from "./request-entry-fixture";

const joinedOf = (owner: string) => ({ by: "flight", with: owner });

beforeEach(() => {
  toasts.error.mockClear();
  toasts.warning.mockClear();
  useStudioStore.setState((state) => ({
    studioInfo: null,
    requests: [
      requestEntry({ id: "a", method: "list" }),
      requestEntry({ id: "b", method: "get" }),
      requestEntry({ id: "j1", method: "list", shared: { by: "flight", with: "a" } }),
      requestEntry({ id: "j2", method: "list", shared: { by: "flight", with: "a" } }),
    ],
    settings: {
      ...state.settings,
      toastOnError: true,
      toastOnSlowRequest: true,
      slowRequestThreshold: 500,
    },
  }));
});

describe("a failed request", () => {
  it("is told once, with the calls whose reads it answered", () => {
    notifyOnEvents(
      [
        { type: "request:error", requestId: "a" },
        { type: "request:error", requestId: "j1", shared: joinedOf("a") },
        { type: "request:error", requestId: "j2", shared: joinedOf("a") },
      ],
      useStudioStore.getState,
    );

    expect(toasts.error.mock.calls).toEqual([["Request failed: api.users.list (3 calls)"]]);
  });

  it("is counted among the requests of a burst, the calls named where reads shared them", () => {
    notifyOnEvents(
      [
        { type: "request:error", requestId: "a" },
        { type: "request:error", requestId: "j1", shared: joinedOf("a") },
        { type: "request:error", requestId: "b" },
      ],
      useStudioStore.getState,
    );
    notifyOnEvents(
      [
        { type: "request:error", requestId: "a" },
        { type: "request:error", requestId: "b" },
      ],
      useStudioStore.getState,
    );

    expect(toasts.error.mock.calls).toEqual([
      ["2 requests failed, the latest api.users.get (3 calls)"],
      ["2 requests failed, the latest api.users.get"],
    ]);
  });

  it("is not told again by the reads that shared it, when their events come later", () => {
    notifyOnEvents(
      [
        { type: "request:error", requestId: "j1", shared: joinedOf("a") },
        { type: "request:error", requestId: "j2", shared: joinedOf("a") },
      ],
      useStudioStore.getState,
    );

    expect(toasts.error).not.toHaveBeenCalled();
  });
});

describe("a call its caller cancelled", () => {
  it("is toasted as no failure", () => {
    notifyOnEvents(
      [{ type: "request:error", requestId: "b", error: { type: "aborted", message: "aborted" } }],
      useStudioStore.getState,
    );

    expect(toasts.error).not.toHaveBeenCalled();
  });
});

describe("a slow request", () => {
  it("is told once, and not for the reads that waited on it", () => {
    notifyOnEvents(
      [
        { type: "request:end", requestId: "a", timing: { total: 800 } },
        { type: "request:end", requestId: "j1", shared: joinedOf("a"), timing: { total: 790 } },
        { type: "request:end", requestId: "j2", shared: joinedOf("a"), timing: { total: 640 } },
      ],
      useStudioStore.getState,
    );

    expect(toasts.warning.mock.calls).toEqual([["Slow request: api.users.list (800ms)"]]);
    expect(toasts.error).not.toHaveBeenCalled();
  });
});
