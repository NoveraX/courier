/**
 * @vitest-environment jsdom
 *
 * The "⋯" menu of a narrow toolbar: a labelled button whose actions exist
 * only while it is open, each doing what it says unless it is disabled.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Download, Trash2 } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OverflowMenu } from "@/design/overflow-menu";

afterEach(cleanup);

function open(): void {
  const trigger = screen.getByRole("button", { name: "More actions" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
}

describe("OverflowMenu", () => {
  it("renders its actions only while it is open", () => {
    render(
      <OverflowMenu
        label="More actions"
        actions={[{ key: "export", label: "Export", icon: Download, onSelect: () => {} }]}
      />,
    );
    expect(screen.queryByRole("menuitem", { name: "Export" })).toBeNull();

    open();

    expect(screen.getByRole("menuitem", { name: "Export" })).toBeTruthy();
  });

  it("runs the action picked, and none that is disabled", () => {
    const exported = vi.fn();
    const cleared = vi.fn();
    render(
      <OverflowMenu
        label="More actions"
        actions={[
          { key: "export", label: "Export", icon: Download, onSelect: exported },
          {
            key: "clear",
            label: "Clear",
            icon: Trash2,
            onSelect: cleared,
            disabled: true,
            tone: "danger",
          },
        ]}
      />,
    );

    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear" }));
    expect(cleared).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Export" }));

    expect(exported).toHaveBeenCalledOnce();
  });
});
