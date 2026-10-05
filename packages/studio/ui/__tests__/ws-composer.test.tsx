/**
 * @vitest-environment jsdom
 *
 * The message box of a WebSocket channel opened in the Playground: offered
 * once the channel is open — not once it has sent something, or a channel
 * that answers messages and says nothing first could never be written to —
 * and gone once it closes; it sends what is typed, comments and trailing
 * commas stripped, on the run's channel, and says so when that is not JSON.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/socket", () => ({ getSocket: () => ({ emit }) }));
vi.mock("sonner", () => ({ toast }));

import { ResponseContent } from "@/screens/playground/response-content";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
    <ResponseContent
      entry={entry}
      row={undefined}
      tab="messages"
      payload={{ mode: "tree", onMode: () => {} }}
      now={0}
      sendingLabel=""
      onCancel={() => {}}
    />,
  );
}

const box = () => screen.getByRole("textbox", { name: "Message to send" });

async function type(text: string): Promise<void> {
  await act(async () => {
    fireEvent.change(box(), { target: { value: text } });
  });
}

describe("a WebSocket channel in the Playground", () => {
  it("can be written to once open, before it has sent anything", async () => {
    show(channelEntry({ streamStatus: "streaming" }));

    await type('{ "text": "hi", }');
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    expect(emit).toHaveBeenCalledWith("playground:write", { rid: "rid-1", data: { text: "hi" } });
    expect(box()).toHaveProperty("value", "");
  });

  it("sends on Enter, and not an empty message", async () => {
    show(channelEntry({ streamStatus: "streaming" }));
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);

    await type("   ");
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
    await type('{ "type": "ping" }');
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });

    expect(emit).toHaveBeenCalledWith("playground:write", {
      rid: "rid-1",
      data: { type: "ping" },
    });
  });

  it("says so when the message is not JSON, and keeps it to fix", async () => {
    show(channelEntry({ streamStatus: "streaming" }));

    await type("{ type: ping }");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    expect(toast.error).toHaveBeenCalledWith("The message is not valid JSON");
    expect(emit).not.toHaveBeenCalled();
    expect(box()).toHaveProperty("value", "{ type: ping }");
  });

  it("cannot be written to once it has closed", () => {
    show(
      channelEntry({
        streamStatus: "complete",
        chunks: [{ kind: "ws-message", data: { text: "bye" } }],
      }),
    );

    expect(screen.queryByRole("textbox", { name: "Message to send" })).toBeNull();
  });
});
