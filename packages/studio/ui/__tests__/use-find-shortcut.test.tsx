/**
 * @vitest-environment jsdom
 *
 * ⌘F, or Ctrl+F off a Mac, brings a long view's own search field to hand
 * while the person works in the view: after a click in it, or with the focus
 * in it. The browser's find is left alone after a click elsewhere, in a
 * short view, for Ctrl+F on a Mac, for keys that are not find, and for a key
 * a handler has already taken.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ apple: true }));
vi.mock("@/lib/apple-platform", () => ({ isApplePlatform: () => platform.apple }));

import { useFindShortcut } from "@/hooks/use-find-shortcut";

afterEach(() => {
  cleanup();
  platform.apple = true;
});

function View({ enabled = true }: { enabled?: boolean }): React.ReactNode {
  const view = useRef<HTMLDivElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  useFindShortcut({ viewRef: view, fieldRef: field, enabled });
  return (
    <>
      <div ref={view}>
        <input ref={field} aria-label="Find in the answer" defaultValue="grace" />
        <p>User 0</p>
      </div>
      <button type="button">Elsewhere</button>
    </>
  );
}

const field = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Find in the answer" });

/* A key pressed where the focus is; whether the page took it from the browser. */
function taken(init: KeyboardEventInit): boolean {
  return !fireEvent.keyDown(document.activeElement ?? document.body, init);
}

const COMMAND_F = { key: "f", code: "KeyF", metaKey: true };
const CONTROL_F = { key: "f", code: "KeyF", ctrlKey: true };

describe("useFindShortcut", () => {
  it("brings the view's search field to hand on Command+F after a click in the view", () => {
    render(<View />);
    fireEvent.pointerDown(screen.getByText("User 0"));

    expect(taken(COMMAND_F)).toBe(true);
    expect(document.activeElement).toBe(field());
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 5]);
  });

  it("takes Ctrl+F off a Mac, and leaves Command+F to the browser there", () => {
    platform.apple = false;
    render(<View />);
    fireEvent.pointerDown(screen.getByText("User 0"));

    expect(taken({ ...COMMAND_F })).toBe(false);
    expect(taken(CONTROL_F)).toBe(true);
    expect(document.activeElement).toBe(field());
  });

  it("leaves Ctrl+F on a Mac to the text field, where it moves the caret", () => {
    render(<View />);
    field().focus();

    expect(taken(CONTROL_F)).toBe(false);
  });

  it("knows the F key by its place on a layout whose letters are not Latin", () => {
    render(<View />);
    fireEvent.pointerDown(screen.getByText("User 0"));
    const cyrillicA = String.fromCharCode(0x0430);

    expect(taken({ key: cyrillicA, code: "KeyF", metaKey: true })).toBe(true);
  });

  it("leaves a Latin letter the F key types on another layout, and F with Shift or Alt, to the browser", () => {
    render(<View />);
    fireEvent.pointerDown(screen.getByText("User 0"));

    expect(taken({ key: "u", code: "KeyF", metaKey: true })).toBe(false);
    expect(taken({ ...COMMAND_F, shiftKey: true })).toBe(false);
    expect(taken({ ...COMMAND_F, altKey: true })).toBe(false);
    expect(taken({ key: "g", code: "KeyG", metaKey: true })).toBe(false);
  });

  it("leaves the browser's find alone after a click elsewhere", () => {
    render(<View />);
    fireEvent.pointerDown(screen.getByText("User 0"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }));

    expect(taken(COMMAND_F)).toBe(false);
    expect(document.activeElement).not.toBe(field());
  });

  it("leaves the browser's find alone in a short view", () => {
    render(<View enabled={false} />);
    fireEvent.pointerDown(screen.getByText("User 0"));

    expect(taken(COMMAND_F)).toBe(false);
  });

  it("counts the focus already in the view when the view grows long", () => {
    const { rerender } = render(<View enabled={false} />);
    field().focus();
    field().setSelectionRange(5, 5);

    rerender(<View />);

    expect(taken(COMMAND_F)).toBe(true);
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 5]);
  });

  it("leaves a key another handler has already taken", () => {
    render(<View />);
    fireEvent.pointerDown(screen.getByText("User 0"));
    const before = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener("keydown", before, true);

    try {
      fireEvent.keyDown(document.body, COMMAND_F);
    } finally {
      document.removeEventListener("keydown", before, true);
    }

    expect(document.activeElement).not.toBe(field());
  });
});
