/**
 * @vitest-environment jsdom
 *
 * The WebSocket compose panel sends the message its draft holds — comments
 * and trailing commas stripped — and starts a fresh draft. A draft that holds
 * nothing to send cannot be sent, and a send that fails is not swallowed.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { WSComposePanel } from "@/views/playground/ws-compose-panel";

afterEach(cleanup);

function shown(onSend: (data: unknown) => void): void {
  render(
    <TooltipProvider>
      <WSComposePanel disabled={false} onSend={onSend} />
    </TooltipProvider>,
  );
}

function draft(text: string): void {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
}

function sendButton(): HTMLElement {
  return screen.getByRole("button", { name: "Send message" });
}

describe("the WebSocket compose panel", () => {
  it("sends what the draft holds and starts a fresh one", () => {
    const onSend = vi.fn();
    shown(onSend);

    draft(["// greeting", '{ "text": "hi", }'].join("\n"));
    fireEvent.click(sendButton());

    expect(onSend).toHaveBeenCalledWith({ text: "hi" });
    expect(screen.getByRole("textbox")).toHaveProperty("value", "{}");
  });

  it("cannot send a draft whose comments leave nothing", () => {
    shown(vi.fn());

    draft("// nothing yet\n{}");

    expect(sendButton()).toHaveProperty("disabled", true);
  });

  it("lets a send that fails surface", () => {
    const failure = new Error("the channel is closed");
    const surfaced: unknown[] = [];
    const onError = (event: ErrorEvent): void => {
      surfaced.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", onError);
    shown(() => {
      throw failure;
    });

    draft('{ "text": "hi" }');
    fireEvent.click(sendButton());
    window.removeEventListener("error", onError);

    expect(surfaced).toContain(failure);
  });
});
