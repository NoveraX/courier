/**
 * @vitest-environment jsdom
 */
/**
 * The message box of a WebSocket channel opened in the Playground.
 *
 * It was offered only once the channel had sent something, so a channel that
 * answers messages and says nothing first could never be written to, and the
 * entry sat at "Waiting for events..." for good.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());

vi.mock("@/socket", () => ({ getSocket: () => ({ emit }) }));

import { TooltipProvider } from "../src/components/ui/tooltip";
import type { PlaygroundHistoryEntry } from "../src/store/types-ui";
import { StreamEventsTab } from "../src/views/playground/stream-events-tab";

afterEach(() => {
  cleanup();
  emit.mockClear();
});

function channelEntry(patch: Partial<PlaygroundHistoryEntry>): PlaygroundHistoryEntry {
  return {
    id: "entry-1",
    rid: "rid-1",
    source: "api",
    group: "live",
    method: "silent",
    variables: "{}",
    headers: "{}",
    mode: "direct",
    timestamp: 0,
    status: "pending",
    transport: "ws",
    streamStatus: "connecting",
    chunks: [],
    ...patch,
  };
}

function show(entry: PlaygroundHistoryEntry): void {
  render(
    <TooltipProvider>
      <StreamEventsTab entry={entry} />
    </TooltipProvider>,
  );
}

function send(text: string): void {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  const button = screen.getAllByRole("button").at(-1);
  if (!button) throw new Error("no send button");
  fireEvent.click(button);
}

describe("a WebSocket channel in the Playground", () => {
  it("can be written to before it has sent anything", () => {
    show(channelEntry({}));

    expect(screen.getByText("Waiting for events...")).toBeDefined();
    send('{"text":"hi"}');

    expect(emit).toHaveBeenCalledWith("playground:write", { rid: "rid-1", data: { text: "hi" } });
  });

  it("cannot be written to once it has closed", () => {
    show(
      channelEntry({
        streamStatus: "complete",
        chunks: [{ kind: "ws-message", data: { text: "bye" } }],
      }),
    );
    send('{"text":"hi"}');

    expect(emit).not.toHaveBeenCalled();
  });
});
