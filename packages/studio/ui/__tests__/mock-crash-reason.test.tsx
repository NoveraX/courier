/**
 * @vitest-environment jsdom
 *
 * A managed mock that could not start says why where the user looks: on
 * the wizard's last step and on the Mocks page, as a sentence rather than a
 * stack trace in a tooltip. And a mock that is not running shows no address
 * to copy: its port may be another process's, as when that process holding
 * it is why the mock crashed.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

import { mockFailureReason } from "@/features/mocks/mock-failure-reason";
import { DoneStep } from "@/screens/mocks/wizard/done-step";
import { useStudioStore } from "@/store";
import { handleServerConnect } from "@/store/handle-mock-server-events";
import { useMockStore } from "@/store/mock-slice";
import { openShell } from "./shell-harness";

const PORT_TAKEN =
  "Error: listen EADDRINUSE: address already in use 127.0.0.1:7501\n" +
  "    at Server.setupListenHandle [as _listen2] (node:net:1908:16)\n" +
  "    at listenInCluster (node:net:1965:12)";

beforeEach(() => {
  useStudioStore.setState({ connected: true, connectionStatus: "connected" });
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

describe("a mock that could not start", () => {
  it("says why on the wizard's last step", () => {
    render(
      <DoneStep
        applied={{
          status: "applied",
          target: "courier.mocks.ts",
          keys: ["third"],
          warnings: [],
          at: Date.now(),
        }}
        connected
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "mocks.third is not running: Port 7501 is in use by another process",
    );
  });

  it("says why on the Mocks page, and offers no address to copy", async () => {
    await openShell("/mocks");

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("third is not running");
    expect(alert.textContent).toContain("Port 7501 is in use by another process");
    expect(document.body.textContent).not.toContain("http://localhost:7501");
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
