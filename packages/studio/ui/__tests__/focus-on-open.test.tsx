/**
 * @vitest-environment jsdom
 *
 * Where a dialog puts the focus as it opens: on its first control when it
 * was opened from the keyboard, on itself when it was opened with a tap or
 * a click, and on a control that focuses itself either way.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { focusOnOpen } from "@/design/focus-on-open";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* jsdom does not tell how an element got the focus; a browser rings one the keyboard focused. */
function ringKeyboardFocus(): void {
  const matches = HTMLElement.prototype.matches;
  vi.spyOn(HTMLElement.prototype, "matches").mockImplementation(function (
    this: HTMLElement,
    selector: string,
  ) {
    return selector === ":focus-visible"
      ? this === document.activeElement
      : matches.call(this, selector);
  });
}

function Probe({ field = false }: { field?: boolean }): React.ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>Open</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined} onOpenAutoFocus={focusOnOpen}>
          <Dialog.Title>Navigation</Dialog.Title>
          <Dialog.Close>Close</Dialog.Close>
          {/* biome-ignore lint/a11y/noAutofocus: the case of a field that focuses itself */}
          {field && <input aria-label="Search" autoFocus />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

describe("focusOnOpen", () => {
  it("holds the focus on the dialog itself when a tap opened it", () => {
    render(<Probe />);

    act(() => fireEvent.click(screen.getByRole("button", { name: "Open" })));

    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("lets the focus go to the first control when the keyboard opened it", () => {
    ringKeyboardFocus();
    render(<Probe />);
    const opener = screen.getByRole("button", { name: "Open" });

    opener.focus();
    act(() => fireEvent.click(opener));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("leaves the focus on a field that focuses itself as the dialog opens", () => {
    render(<Probe field />);

    act(() => fireEvent.click(screen.getByRole("button", { name: "Open" })));

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search" }));
  });
});
