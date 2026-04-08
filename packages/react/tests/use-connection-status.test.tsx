/**
 * @vitest-environment jsdom
 */

import { type ReactNode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createConnectionState } from "@noverax/nexus/realtime";

import { useConnectionStatus } from "../src/hooks/use-connection-status";
import type { ConnectionStatusSource } from "../src/hooks/use-connection-status";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function createSource(initial: "disconnected" | "connecting" | "connected" | "reconnecting" = "disconnected"): {
  source: ConnectionStatusSource;
  setState: (s: "disconnected" | "connecting" | "connected" | "reconnecting") => void;
} {
  const state = createConnectionState(initial);
  const source: ConnectionStatusSource = {
    get status() {
      return state.current;
    },
    onStatusChange: (handler) => state.subscribe(handler),
  };
  return { source, setState: (s) => state.set(s) };
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useConnectionStatus", () => {
  it("returns disconnected state for null source", () => {
    const { result } = renderHook(() => useConnectionStatus(null), { wrapper });

    expect(result.current.status).toBe("disconnected");
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isReconnecting).toBe(false);
  });

  it("returns initial state from source", () => {
    const { source } = createSource("connected");

    const { result } = renderHook(() => useConnectionStatus(source), { wrapper });

    expect(result.current.status).toBe("connected");
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isReconnecting).toBe(false);
  });

  it("reacts to state transitions", () => {
    const { source, setState } = createSource("disconnected");

    const { result } = renderHook(() => useConnectionStatus(source), { wrapper });

    expect(result.current.status).toBe("disconnected");

    act(() => setState("connecting"));
    expect(result.current.status).toBe("connecting");
    expect(result.current.isConnected).toBe(false);

    act(() => setState("connected"));
    expect(result.current.status).toBe("connected");
    expect(result.current.isConnected).toBe(true);

    act(() => setState("reconnecting"));
    expect(result.current.status).toBe("reconnecting");
    expect(result.current.isReconnecting).toBe(true);
    expect(result.current.isConnected).toBe(false);

    act(() => setState("disconnected"));
    expect(result.current.status).toBe("disconnected");
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isReconnecting).toBe(false);
  });

  it("cleans up subscription on unmount", () => {
    const state = createConnectionState("connected");
    const unsubSpy = vi.fn();

    const source: ConnectionStatusSource = {
      get status() {
        return state.current;
      },
      onStatusChange: (handler) => {
        const unsub = state.subscribe(handler);
        return () => {
          unsub();
          unsubSpy();
        };
      },
    };

    const { unmount } = renderHook(() => useConnectionStatus(source), { wrapper });

    unmount();

    expect(unsubSpy).toHaveBeenCalledTimes(1);
  });

  it("handles SSE-like source (status + onStatusChange)", () => {
    const { source, setState } = createSource("connecting");

    const { result } = renderHook(() => useConnectionStatus(source), { wrapper });

    expect(result.current.status).toBe("connecting");

    act(() => setState("connected"));
    expect(result.current.isConnected).toBe(true);
  });

  it("handles WS-like source (status + onStatusChange)", () => {
    const { source, setState } = createSource("disconnected");

    const { result } = renderHook(() => useConnectionStatus(source), { wrapper });

    act(() => setState("connecting"));
    expect(result.current.status).toBe("connecting");

    act(() => setState("connected"));
    expect(result.current.isConnected).toBe(true);

    act(() => setState("reconnecting"));
    expect(result.current.isReconnecting).toBe(true);
  });

  it("switches source when reference changes", () => {
    const first = createSource("connected");
    const second = createSource("disconnected");

    let activeSource = first.source;

    const { result, rerender } = renderHook(
      () => useConnectionStatus(activeSource),
      { wrapper },
    );

    expect(result.current.isConnected).toBe(true);

    activeSource = second.source;
    rerender();

    expect(result.current.status).toBe("disconnected");
    expect(result.current.isConnected).toBe(false);
  });
});
