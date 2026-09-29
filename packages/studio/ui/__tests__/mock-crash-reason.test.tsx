/**
 * @vitest-environment jsdom
 */
/**
 * A managed mock that could not start says why where the user looks: on
 * the wizard's last step and on the Mocks page, as a sentence rather than a
 * stack trace in a tooltip. And a mock that is not running shows no address
 * to copy: its port may be another process's, as when that process holding
 * it is why the mock crashed.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("socket.io-client", () => ({
  io: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), io: { on: vi.fn(), off: vi.fn() } }),
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { handleServerConnect } from "../src/store/handle-mock-server-events";
import { useMockStore } from "../src/store/mock-slice";
import { DashboardGrid } from "../src/views/mocks/dashboard/dashboard-grid";
import { mockFailureReason } from "../src/views/mocks/shared/mock-failure-reason";
import { DoneStep } from "../src/views/mocks/wizard/step-done";

const PORT_TAKEN =
  "Error: listen EADDRINUSE: address already in use 127.0.0.1:7501\n" +
  "    at Server.setupListenHandle [as _listen2] (node:net:1908:16)\n" +
  "    at listenInCluster (node:net:1965:12)";

beforeEach(() => {
  for (const id of Object.keys(useMockStore.getState().servers)) {
    useMockStore.getState().removeServer(id);
  }
  handleServerConnect("third", {
    type: "mock:server:connect",
    serverId: "third",
    name: "third",
    port: 7501,
    url: "http://localhost:7501",
    managed: true,
    origin: "studio",
    processStatus: "crashed",
    lastError: PORT_TAKEN,
  });
});

afterEach(() => cleanup());

function third() {
  const server = useMockStore.getState().servers.third;
  if (!server) throw new Error("mock not registered");
  return server;
}

describe("a mock that could not start", () => {
  it("says why on the wizard's last step", () => {
    render(
      <TooltipProvider>
        <DoneStep
          applied={{
            status: "applied",
            target: "courier.mocks.ts",
            keys: ["third"],
            warnings: [],
            at: Date.now(),
          }}
          connected
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "mocks.third is not running: Port 7501 is in use by another process",
    );
  });

  it("says why on the Mocks page, and offers no address to copy", () => {
    render(
      <TooltipProvider>
        <DashboardGrid server={third()} />
      </TooltipProvider>,
    );

    expect(screen.getByText("Not listening")).toBeTruthy();
    expect(document.body.textContent).not.toContain("http://localhost:7501");
    expect(screen.queryByRole("button", { name: "Copy URL" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "Port 7501 is in use by another process",
    );
  });
});

describe("the reason a mock failed", () => {
  it("is the first line of what it reported, without the error's name", () => {
    expect(
      mockFailureReason(
        "TypeError: defineMockServer is not a function\n    at file:///app/courier.mocks.ts:3:1",
      ),
    ).toBe("defineMockServer is not a function");
    expect(mockFailureReason('Mock "gone" in courier.mocks.ts is not declared.')).toBe(
      'Mock "gone" in courier.mocks.ts is not declared.',
    );
  });
});
