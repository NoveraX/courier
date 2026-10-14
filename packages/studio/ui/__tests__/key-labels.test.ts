/**
 * A shortcut's keys as the keyboard in front of the user labels them: a
 * Mac's symbols in a Mac's order, the words and the order of everywhere
 * else, and each key's name for a screen reader.
 */
import { describe, expect, it } from "vitest";

import { keyLabels } from "@/lib/key-labels";

const labels = (keys: readonly string[], apple: boolean) =>
  keyLabels(keys, apple).map((key) => key.label);

describe("keyLabels", () => {
  it("writes a Mac's symbols, its modifiers in a Mac's order", () => {
    expect(labels(["mod", "shift", "L"], true)).toEqual(["⇧", "⌘", "L"]);
    expect(labels(["mod", "backspace"], true)).toEqual(["⌘", "⌫"]);
    expect(labels(["mod", "enter"], true)).toEqual(["⌘", "↵"]);
  });

  it("writes the words of everywhere else, Ctrl first", () => {
    expect(labels(["mod", "shift", "L"], false)).toEqual(["Ctrl", "Shift", "L"]);
    expect(labels(["mod", "backspace"], false)).toEqual(["Ctrl", "Backspace"]);
    expect(labels(["mod", "enter"], false)).toEqual(["Ctrl", "Enter"]);
  });

  it("names each key for a screen reader", () => {
    expect(keyLabels(["mod", "."], true).map((key) => key.spoken)).toEqual(["Command", "Period"]);
    expect(keyLabels(["mod", "."], false).map((key) => key.spoken)).toEqual(["Control", "Period"]);
  });

  it("keeps a key it has no name for as it is", () => {
    expect(keyLabels(["mod", "K"], false)).toEqual([
      { label: "Ctrl", spoken: "Control" },
      { label: "K", spoken: "K" },
    ]);
  });
});
