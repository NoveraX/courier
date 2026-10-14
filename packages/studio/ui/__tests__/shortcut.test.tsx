/**
 * @vitest-environment jsdom
 *
 * A shortcut shows each key on a keycap of its own, labelled as the
 * user's keyboard labels it, and a screen reader hears the keys' names
 * rather than the symbols.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Shortcut } from "@/design/shortcut";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function keycaps(container: HTMLElement): string[] {
  return [...container.querySelectorAll('kbd kbd[aria-hidden="true"]')].map(
    (key) => key.textContent ?? "",
  );
}

describe("Shortcut", () => {
  it("shows a Mac's keys in a Mac's order", () => {
    vi.stubGlobal("navigator", { ...navigator, platform: "MacIntel" });

    const { container } = render(<Shortcut keys={["mod", "shift", "L"]} />);

    expect(keycaps(container)).toEqual(["⇧", "⌘", "L"]);
    expect(container.querySelector(".sr-only")?.textContent).toBe("Shift Command L");
  });

  it("shows Ctrl and words elsewhere", () => {
    vi.stubGlobal("navigator", { ...navigator, platform: "Win32" });

    const { container } = render(<Shortcut keys={["mod", "backspace"]} />);

    expect(keycaps(container)).toEqual(["Ctrl", "Backspace"]);
    expect(container.querySelector(".sr-only")?.textContent).toBe("Control Backspace");
  });
});
