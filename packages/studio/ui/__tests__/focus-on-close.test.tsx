/**
 * @vitest-environment jsdom
 *
 * Where an overlay leaves the focus as it closes. Radix gives the focus
 * back a moment after the overlay has left the page; a focus that went to
 * another element in that moment — as a script, or a test typing straight
 * on, puts it — stays there, and one that fell to the page goes back to
 * what opened the overlay, or to the element it is told to give it to.
 * jsdom plays no exit animation, so an overlay leaves the page as it
 * closes, and the moment lasts until the timers run.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ContextMenu, Dialog, DropdownMenu, Popover } from "radix-ui";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { focusOnClose } from "@/design/focus-on-close";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* An overlay opens on a timer or two of its own: its place on the page, its listeners. */
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

/* The moment runs out: Radix gives the focus back. */
function giveFocusBack(): void {
  act(() => vi.runOnlyPendingTimers());
}

const editor = (): HTMLElement => screen.getByRole("textbox", { name: "Editor" });

function PopoverProbe(): React.ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger>Endpoint</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content aria-label="Endpoints" onCloseAutoFocus={focusOnClose}>
            <button type="button" onClick={() => setOpen(false)}>
              users.get
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <textarea aria-label="Editor" />
    </>
  );
}

function DropdownProbe(): React.ReactNode {
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>Copy as</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content onCloseAutoFocus={focusOnClose}>
            <DropdownMenu.Item>cURL</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <textarea aria-label="Editor" />
    </>
  );
}

function ContextProbe(): React.ReactNode {
  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button type="button">GET /users</button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content onCloseAutoFocus={focusOnClose}>
            <ContextMenu.Item>Pin request</ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <textarea aria-label="Editor" />
    </>
  );
}

function DialogProbe(): React.ReactNode {
  return (
    <>
      <Dialog.Root>
        <Dialog.Trigger>Import</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={focusOnClose}>
            <Dialog.Title>Import API</Dialog.Title>
            <Dialog.Close>Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <textarea aria-label="Editor" />
    </>
  );
}

/* A drawer that something outside it opens, as the menu button opens the navigation. */
function DrawerProbe(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={menuButton} type="button" onClick={() => setOpen(true)}>
        Open navigation
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Content
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => focusOnClose(event, menuButton)}
          >
            <Dialog.Title>Navigation</Dialog.Title>
            <Dialog.Close>Close navigation</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <textarea aria-label="Editor" />
    </>
  );
}

const button = (name: string): HTMLElement => screen.getByRole("button", { name });

const OVERLAYS = [
  {
    kind: "popover",
    Probe: PopoverProbe,
    open: () => fireEvent.click(button("Endpoint")),
    choose: () => fireEvent.click(button("users.get")),
    opener: () => button("Endpoint"),
  },
  {
    kind: "dropdown menu",
    Probe: DropdownProbe,
    open: () => fireEvent.keyDown(button("Copy as"), { key: "Enter" }),
    choose: () => fireEvent.click(screen.getByRole("menuitem", { name: "cURL" })),
    opener: () => button("Copy as"),
  },
  {
    kind: "context menu",
    Probe: ContextProbe,
    open: () => {
      button("GET /users").focus();
      fireEvent.contextMenu(button("GET /users"));
    },
    choose: () => fireEvent.click(screen.getByRole("menuitem", { name: "Pin request" })),
    opener: () => button("GET /users"),
  },
  {
    kind: "dialog",
    Probe: DialogProbe,
    open: () => fireEvent.click(button("Import")),
    choose: () => fireEvent.click(button("Close")),
    opener: () => button("Import"),
  },
  {
    kind: "dialog opened from outside it",
    Probe: DrawerProbe,
    open: () => fireEvent.click(button("Open navigation")),
    choose: () => fireEvent.click(button("Close navigation")),
    opener: () => button("Open navigation"),
  },
];

describe.each(OVERLAYS)("focusOnClose on a $kind", ({ Probe, open, choose, opener }) => {
  it("keeps the focus on an element that took it while the overlay left", async () => {
    render(<Probe />);
    act(open);
    await settle();

    act(choose);
    expect(document.activeElement).toBe(document.body);
    editor().focus();
    giveFocusBack();

    expect(document.activeElement).toBe(editor());
  });

  it("gives the focus back to what opened the overlay when it fell to the page", async () => {
    render(<Probe />);
    act(open);
    await settle();

    act(choose);
    expect(document.activeElement).toBe(document.body);
    giveFocusBack();

    expect(document.activeElement).toBe(opener());
  });
});
