/**
 * @vitest-environment jsdom
 *
 * A page that opens is connecting, not disconnected: it says neither
 * "Connection lost" nor "disconnected" before its first connection settles.
 * And the WS compose button says what it does, not only its keyboard
 * shortcut.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({ getSocket: () => ({ emit: vi.fn() }) }));

import { DisconnectedBanner } from "@/components/layout/disconnected-banner";
import { StatusBar } from "@/components/layout/status-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStudioStore } from "@/store";
import { WSComposePanel } from "@/views/playground/ws-compose-panel";

afterEach(cleanup);

describe("a page that opens", () => {
  it("is connecting until its first connection settles, and says nothing was lost", () => {
    expect(useStudioStore.getState().connectionStatus).toBe("connecting");

    render(
      <TooltipProvider>
        <DisconnectedBanner />
        <StatusBar />
      </TooltipProvider>,
    );

    expect(screen.queryByText(/Connection lost/)).toBeNull();
    expect(screen.getByText("connecting...")).toBeTruthy();
  });

  it("says the connection is lost once one that opened drops", () => {
    useStudioStore.getState().setConnectionStatus("disconnected");

    render(<DisconnectedBanner />);

    expect(screen.getByText(/Connection lost/)).toBeTruthy();
  });
});

describe("the WS compose button", () => {
  it("is named for what it does", () => {
    render(
      <TooltipProvider>
        <WSComposePanel disabled={false} onSend={() => {}} />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Send message" })).toBeTruthy();
  });
});
