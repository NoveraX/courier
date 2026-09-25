/**
 * Copying from Studio's UI works where the browser offers no clipboard API
 * — an http page opened from another address on the network — by copying
 * through a selection, and says why when it cannot copy at all, instead of
 * failing silently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import { copyToClipboard } from "../src/lib/clipboard";

interface FakeTextArea {
  value: string;
  style: Record<string, string>;
  setAttribute: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function pageWithSelection(copies: boolean): { area: FakeTextArea; execCommand: ReturnType<typeof vi.fn> } {
  const area: FakeTextArea = {
    value: "",
    style: {},
    setAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  };
  const execCommand = vi.fn(() => copies);
  vi.stubGlobal("document", {
    activeElement: null,
    createElement: vi.fn(() => area),
    body: { appendChild: vi.fn() },
    execCommand,
  });
  return { area, execCommand };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const fn of Object.values(toast)) fn.mockClear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  warn.mockRestore();
});

describe("copying", () => {
  it("copies through a selection on a page without the clipboard API", async () => {
    vi.stubGlobal("navigator", {});
    const { area, execCommand } = pageWithSelection(true);

    await copyToClipboard("export default defineMocks({});", "snippet");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(area.value).toBe("export default defineMocks({});");
    expect(area.remove).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Copied snippet");
  });

  it("says copying needs a secure page when neither way works", async () => {
    vi.stubGlobal("navigator", {});
    pageWithSelection(false);

    await expect(copyToClipboard("x", "snippet")).resolves.toBeUndefined();

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0]?.[0]).toBe(
      "Copying needs a secure page (https or localhost). Select the text and copy it with the keyboard instead.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("falls back to a selection when the clipboard API refuses, and names the refusal when that fails too", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("Document is not focused.");
    });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { execCommand } = pageWithSelection(false);

    await copyToClipboard("x", "cURL");

    expect(writeText).toHaveBeenCalledWith("x");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(toast.error.mock.calls[0]?.[0]).toMatch(/^The browser refused to copy \(Document is not focused\.\)/);
  });

  it("uses the clipboard API where the page has it", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { execCommand } = pageWithSelection(true);

    await copyToClipboard("x", "JSON");

    expect(writeText).toHaveBeenCalledWith("x");
    expect(execCommand).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Copied JSON");
  });
});
