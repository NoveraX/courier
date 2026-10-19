/**
 * @vitest-environment jsdom
 *
 * The navigation drawer's status: the whole of what the status bar says,
 * for a phone whose bar keeps only the connection and the counts of
 * requests and errors — the session's length, the files watched, the bytes,
 * the calls in flight and the streams, every notice in full, and the port.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusDetails } from "@/shell/status-bar/status-details";
import { StatusNotices } from "@/shell/status-bar/status-notices";
import type { RequestEntry } from "@/store";
import { useStudioStore } from "@/store";

const NOW = Date.UTC(2026, 9, 12, 21, 0);

function request(id: string, patch: Partial<RequestEntry>): RequestEntry {
  return {
    id,
    source: "api",
    group: "users",
    method: "list",
    variables: undefined,
    mode: "direct",
    status: "success",
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: NOW,
    sessionId: "s",
    ...patch,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    received: { runtimes: true, requests: true },
    bindingSnapshot: {
      rows: [],
      runtimeCount: 2,
      sourceCount: 1,
      runtimes: [
        { runtimeId: "vite-browser", kind: "browser" },
        { runtimeId: "shop-server", kind: "server" },
      ],
    },
    sessionStartedAt: NOW - 204_000,
    watcherApiPaths: 15,
    requests: [
      request("a", { size: 1024 }),
      request("b", { status: "error", size: 1024 }),
      request("c", { status: "pending" }),
      request("d", { streamStatus: "streaming" }),
    ],
    droppedRequests: 0,
    lastBindingError: null,
    configStatus: null,
    paused: false,
    shownSession: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const status = (): HTMLElement => screen.getByRole("region", { name: "Status" });

describe("the drawer's status", () => {
  it("says the whole of the status bar's status, a line each", () => {
    render(<StatusDetails />);

    const lines = [...status().querySelectorAll("p")].map((line) => line.textContent);
    expect(lines).toEqual([
      "2 runtimes · 1 source03:24",
      "watching 15",
      "4 req · 2.0 KB",
      "1 err1 pending1 stream",
      `studio :${window.location.port}`,
    ]);
  });

  it("counts a read another call's request answered among the calls, and not its failure or bytes", () => {
    useStudioStore.setState((state) => ({
      requests: [
        request("joined", { status: "error", size: 1024, shared: { by: "flight", with: "b" } }),
        ...state.requests,
      ],
    }));

    render(<StatusDetails />);

    const lines = [...status().querySelectorAll("p")].map((line) => line.textContent);
    expect(lines.slice(2, 4)).toEqual(["5 calls · 4 req · 2.0 KB", "1 err1 pending1 stream"]);
  });

  it("gives every notice in full, where the bar gives a few words and a title", () => {
    useStudioStore.setState({
      droppedRequests: 3,
      lastBindingError: {
        kind: "conflict",
        details: { sourceName: "api", transport: "http", runtimeIds: ["a", "b"] },
      },
      paused: true,
    });

    render(<StatusDetails />);
    render(<StatusNotices place="bar" />);

    expect(within(status()).getByText(/^3 older calls dropped/)).toBeTruthy();
    expect(
      within(status()).getByText(
        "Binding conflict on api (http) — claimed by a, b. Stop all but one runtime to resolve.",
      ),
    ).toBeTruthy();
    expect(within(status()).getByText("REC PAUSED")).toBeTruthy();
    expect(within(status()).queryByRole("status")).toBeNull();
    const conflict = screen.getByRole("status");
    expect(conflict.textContent).toBe("binding conflict");
    expect(conflict.getAttribute("title")).toMatch(/^Binding conflict on api \(http\)/);
    expect(screen.getByText("3 dropped").getAttribute("title")).toBe(
      "3 older calls dropped — raise the limit in Settings",
    );
  });

  it("names a saved session in place of recording paused", () => {
    useStudioStore.setState({
      paused: true,
      shownSession: { id: "s1", name: "checkout bug" },
    });

    render(<StatusDetails />);

    expect(within(status()).getByText("session checkout bug")).toBeTruthy();
    expect(within(status()).queryByText("REC PAUSED")).toBeNull();
  });
});
