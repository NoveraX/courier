/**
 * The palette's "Go to" group: the setup, every view, and Settings and the
 * documentation the sidebar keeps at its foot — so a phone, whose drawer
 * may be closed, reaches them from the palette as well.
 */
import { describe, expect, it } from "vitest";

import { paletteEntries } from "@/shell/command-palette/palette-entries";

const goTo = () => paletteEntries([], "recording", "har").filter((e) => e.group === "Go to");

describe("the palette's Go to", () => {
  it("offers the setup, every view, Settings and the docs, in the sidebar's order", () => {
    expect(goTo().map((entry) => entry.label)).toEqual([
      "Get started",
      "Timeline",
      "Waterfall",
      "Analytics",
      "Explorer",
      "Playground",
      "APIs",
      "Mocks",
      "Audit",
      "Middleware",
      "Compare",
      "Settings",
      "Docs",
    ]);
  });

  it("goes to Settings, and opens the docs outside Studio", () => {
    const actions = new Map(goTo().map((entry) => [entry.label, entry.action]));

    expect(actions.get("Settings")).toEqual({ kind: "go", to: "/settings" });
    expect(actions.get("Docs")).toEqual({ kind: "open-docs" });
  });
});
