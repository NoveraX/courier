/**
 * When the runtimes attached now began to be, as the binding snapshot tells
 * every page: the status bar's session time is Studio's, so a page that
 * opens later, or reloads, shows the same time, and none counts from a
 * session that ended while no page was open. Once the last one leaves, the
 * snapshot says when, for the pages that wait for the next.
 */
import type { Socket } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildBindingSnapshot } from "../src/server/binding-snapshot";
import { BindingTable } from "../src/server/catalog/binding-table";
import {
  clearStudioServerState,
  registerRuntime,
  runtimesIdleSince,
  unregisterRuntime,
} from "../src/server/runtime-namespace-state";

function attach(runtimeId: string, at: number): void {
  vi.setSystemTime(at);
  const socket = { id: runtimeId, connected: true } as unknown as Socket;
  registerRuntime({ runtimeId, kind: "server", socket, transports: [], sourceNames: [] });
}

function snapshot(): ReturnType<typeof buildBindingSnapshot> {
  return buildBindingSnapshot(new BindingTable());
}

afterEach(() => {
  clearStudioServerState();
  vi.useRealTimers();
});

describe("when the attached runtimes began to be", () => {
  it("is the first one's arrival, while any of them stays", () => {
    vi.useFakeTimers();
    attach("next-server", 1_000);
    attach("next-browser", 5_000);

    unregisterRuntime("next-server");

    expect(snapshot().activeSince).toBe(1_000);
  });

  it("is unknown once the last one left, and begins anew with the next", () => {
    vi.useFakeTimers();
    attach("next-server", 1_000);
    unregisterRuntime("next-server");

    expect(snapshot()).not.toHaveProperty("activeSince");

    attach("next-server", 9_000);

    expect(snapshot().activeSince).toBe(9_000);
  });
});

describe("when the last runtime left", () => {
  it("is told while none is attached, and forgotten once one comes back", () => {
    vi.useFakeTimers();
    attach("next-server", 1_000);
    vi.setSystemTime(4_000);
    unregisterRuntime("next-server");

    expect(snapshot().idleSince).toBe(4_000);

    attach("next-server", 9_000);

    expect(snapshot()).not.toHaveProperty("idleSince");
  });

  it("is not told before any runtime came, nor after Studio's state is cleared", () => {
    expect(snapshot()).not.toHaveProperty("idleSince");

    attach("next-server", 1_000);
    unregisterRuntime("next-server");
    clearStudioServerState();

    expect(runtimesIdleSince()).toBeUndefined();
  });
});
