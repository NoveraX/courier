/**
 * @vitest-environment jsdom
 *
 * The Playground copies a call's URL alone — its path filled and its query
 * built from the variables, as the URL bar shows it — beside the call as
 * code. A file of its own: a Radix menu opened once in jsdom leaves the next
 * one closing as it opens.
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const copied = vi.hoisted(() => vi.fn());

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: copied }));

import { usePlaygroundDrafts } from "@/playground/draft-store";
import { useStudioStore } from "@/store";
import { API, BOUND } from "./playground-fixtures";
import { openShell } from "./shell-harness";

beforeEach(() => {
  usePlaygroundDrafts.setState({
    variables: { "api.users.search": '{ "q": "ada", "limit": 5 }' },
    headers: undefined,
    mode: "direct",
  });
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    received: { runtimes: true, requests: true },
    scanSources: [API],
    bindingSnapshot: BOUND,
    requests: [],
    heldRequests: [],
    playgroundHistory: [],
    playgroundActiveResponse: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("copying a Playground call's URL", () => {
  it("copies its path filled and its query from the variables", async () => {
    await openShell("/playground?endpoint=api.users.search");

    await act(async () => {
      fireEvent.pointerDown(screen.getByRole("button", { name: /Copy as/ }), {
        button: 0,
        ctrlKey: false,
        pointerType: "mouse",
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "URL" }));
    });

    expect(copied).toHaveBeenCalledWith("http://localhost:7501/users/search?q=ada&limit=5", "URL");
  });
});
