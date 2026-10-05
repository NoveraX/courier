/**
 * @vitest-environment jsdom
 *
 * A welcome step's Copy button copies its snippet and moves the walkthrough
 * on, on a page without the clipboard API too — an http page opened from
 * another address on the network — where the snippet is copied through a
 * selection.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import { CopyButton } from "@/screens/welcome/copy-button";

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const fn of Object.values(toast)) fn.mockClear();
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "execCommand");
});

describe("a welcome step's Copy button", () => {
  it("copies the snippet through a selection and moves on, on a page without the clipboard API", async () => {
    expect(navigator.clipboard).toBeUndefined();
    const onCopied = vi.fn();
    render(<CopyButton text="npm install @noverax/courier" onCopied={onCopied} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(onCopied).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says why in an error toast when the page cannot copy, and does not move on", async () => {
    execCommand.mockReturnValue(false);
    const onCopied = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<CopyButton text="npm install @noverax/courier" onCopied={onCopied} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(onCopied).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });
});
