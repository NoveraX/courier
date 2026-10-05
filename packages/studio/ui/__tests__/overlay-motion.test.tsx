/**
 * @vitest-environment jsdom
 *
 * Every dialog Studio opens comes and goes the same way: the shared frame
 * gives its scrim and its window the enter and exit animations, so a new
 * dialog built on the frame gets them without asking.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DialogFrame } from "@/design/dialog-frame";
import { DIALOG_MOTION, SCRIM_MOTION } from "@/design/overlay-motion";

afterEach(cleanup);

function classesOf(element: Element | null): string[] {
  return element?.getAttribute("class")?.split(/\s+/) ?? [];
}

describe("a dialog on the shared frame", () => {
  it("rises in over a fading scrim, and leaves the way it came", () => {
    render(
      <DialogFrame
        open
        onClose={vi.fn()}
        keepOpen={false}
        closable
        title="Import an API"
        width="w-120"
        footer={null}
      >
        <p>body</p>
      </DialogFrame>,
    );
    const dialog = screen.getByRole("dialog", { name: "Import an API" });
    const scrim = document.querySelector("[data-state='open']:not([role='dialog'])");

    expect(classesOf(dialog)).toEqual(expect.arrayContaining(DIALOG_MOTION.split(" ")));
    expect(classesOf(scrim)).toEqual(expect.arrayContaining(SCRIM_MOTION.split(" ")));
  });
});
