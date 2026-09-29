/**
 * @vitest-environment jsdom
 */
/**
 * Store → Add asks the mock server for a record shaped like the others in
 * the collection: each field with an empty value of the type it holds,
 * never `null` in a field the schema types, and no id of the page's own.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());

vi.mock("socket.io-client", () => ({
  io: () => ({
    emit,
    timeout: () => ({ emit }),
    on: vi.fn(),
    off: vi.fn(),
    io: { on: vi.fn(), off: vi.fn() },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";
import { MockStoreView } from "../src/views/mocks/store";

class NoLayoutObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoLayoutObserver);
  for (const id of Object.keys(useMockStore.getState().servers)) {
    useMockStore.getState().removeServer(id);
  }
  handleMockEvent({
    type: "mock:server:connect",
    serverId: "apiMock",
    name: "apiMock",
    processStatus: "running",
    collections: [
      {
        name: "users",
        count: 2,
        records: [
          { id: 1, name: "Ada", admin: true, tags: ["a"], address: { city: "London" } },
          { id: 2, name: "Grace", admin: false, tags: [], address: { city: "NYC" } },
        ],
      },
    ],
  });
  useMockStore.getState().selectServer("apiMock");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("adding a record in the Store view", () => {
  it("sends a record typed like the collection's, without an id", async () => {
    render(
      <TooltipProvider>
        <MockStoreView />
      </TooltipProvider>,
    );

    await act(async () => screen.getByRole("button", { name: "Add" }).click());

    expect(emit).toHaveBeenCalledWith(
      "mock:command",
      {
        action: "mock:store:create",
        serverId: "apiMock",
        collection: "users",
        record: { name: "", admin: false, tags: [], address: {} },
      },
      expect.any(Function),
    );
  });
});
