/**
 * @vitest-environment jsdom
 *
 * What Studio says of the runtimes reaches the page's store: the binding
 * table it sends a page as it connects, which also ends the page's wait for
 * the runtimes — a table the page cannot read ends it too, since Studio has
 * said what it has — and a conflict over a source.
 */
import type { Socket } from "socket.io-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { bindRuntimes } from "@/socket/runtime-bindings";
import { useStudioStore } from "@/store";
import { createInitialState } from "@/store/initial-state";

const TABLE = {
  rows: [],
  runtimeCount: 1,
  sourceCount: 1,
  runtimes: [{ runtimeId: "next-server", kind: "server" }],
};

function fakeSocket() {
  const handlers = new Map<string, (data: unknown) => void>();
  const socket = {
    on: (event: string, handler: (data: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  } as unknown as Socket;
  return { socket, send: (event: string, data: unknown) => handlers.get(event)?.(data), handlers };
}

beforeEach(() => {
  useStudioStore.setState(createInitialState("dark"));
});

describe("bindRuntimes", () => {
  it("takes the table Studio sends, and ends the page's wait for the runtimes", () => {
    const { socket, send } = fakeSocket();
    bindRuntimes(socket, useStudioStore.getState);

    send("binding:snapshot", TABLE);

    expect(useStudioStore.getState()).toMatchObject({
      bindingSnapshot: { runtimeCount: 1 },
      received: { runtimes: true, requests: false },
    });
  });

  it("ends the wait for a table it cannot read too, keeping the one it has", () => {
    const { socket, send } = fakeSocket();
    bindRuntimes(socket, useStudioStore.getState);
    const held = useStudioStore.getState().bindingSnapshot;

    send("binding:snapshot", { rows: "not a list" });

    expect(useStudioStore.getState().bindingSnapshot).toBe(held);
    expect(useStudioStore.getState().received.runtimes).toBe(true);
  });

  it("keeps a conflict Studio reports over a source", () => {
    const { socket, send } = fakeSocket();
    bindRuntimes(socket, useStudioStore.getState);
    const conflict = {
      kind: "conflict",
      details: { sourceName: "shop", transport: "http", runtimeIds: ["a", "b"] },
    };

    send("binding:error", conflict);

    expect(useStudioStore.getState().lastBindingError).toEqual(conflict);
  });

  it("stops listening once unbound", () => {
    const { socket, handlers } = fakeSocket();

    bindRuntimes(socket, useStudioStore.getState)();

    expect(handlers.size).toBe(0);
  });
});
