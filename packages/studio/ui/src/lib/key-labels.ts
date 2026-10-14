/** A key as a keycap shows it, and as a screen reader names it. */
export interface KeyLabel {
  label: string;
  spoken: string;
}

/* The named keys of a shortcut: the label on the keycap, and the key's name read aloud. */
const ON_APPLE = new Map<string, KeyLabel>([
  ["mod", { label: "⌘", spoken: "Command" }],
  ["shift", { label: "⇧", spoken: "Shift" }],
  ["alt", { label: "⌥", spoken: "Option" }],
  ["enter", { label: "↵", spoken: "Return" }],
  ["backspace", { label: "⌫", spoken: "Delete" }],
  ["escape", { label: "esc", spoken: "Escape" }],
  ["up", { label: "↑", spoken: "Up" }],
  ["down", { label: "↓", spoken: "Down" }],
  [".", { label: ".", spoken: "Period" }],
]);
const ELSEWHERE = new Map<string, KeyLabel>([
  ["mod", { label: "Ctrl", spoken: "Control" }],
  ["shift", { label: "Shift", spoken: "Shift" }],
  ["alt", { label: "Alt", spoken: "Alt" }],
  ["enter", { label: "Enter", spoken: "Enter" }],
  ["backspace", { label: "Backspace", spoken: "Backspace" }],
  ["escape", { label: "Esc", spoken: "Escape" }],
  ["up", { label: "↑", spoken: "Up" }],
  ["down", { label: "↓", spoken: "Down" }],
  [".", { label: ".", spoken: "Period" }],
]);

/* The modifiers in the order each writes them: ⌥⇧⌘ on a Mac, Ctrl+Alt+Shift elsewhere. */
const APPLE_ORDER = ["alt", "shift", "mod"];
const OTHER_ORDER = ["mod", "alt", "shift"];

/**
 * The keys of a shortcut as the keyboard in front of the user labels them,
 * its modifiers first, in the order that keyboard's system writes them:
 * `⇧ ⌘ L` on a Mac, `Ctrl Shift L` elsewhere. `mod` is ⌘ on the one and
 * Ctrl on the other, as the shortcuts' handlers take either.
 *
 * @param keys - The keys pressed together, as the handlers name them
 * @param apple - Whether the keyboard is a Mac's, an iPhone's or an iPad's
 * @returns Each key's label and spoken name, in the order to show them
 * @example
 * ```ts
 * keyLabels(["mod", "shift", "L"], true).map((key) => key.label); // ["⇧", "⌘", "L"]
 * keyLabels(["mod", "shift", "L"], false).map((key) => key.label); // ["Ctrl", "Shift", "L"]
 * ```
 */
export function keyLabels(keys: readonly string[], apple: boolean): KeyLabel[] {
  const order = apple ? APPLE_ORDER : OTHER_ORDER;
  const named = apple ? ON_APPLE : ELSEWHERE;
  const modifiers = order.filter((key) => keys.includes(key));
  const rest = keys.filter((key) => !order.includes(key));
  return [...modifiers, ...rest].map((key) => named.get(key) ?? { label: key, spoken: key });
}
