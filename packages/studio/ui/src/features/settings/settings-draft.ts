import type { Settings } from "@/store/types-ui";

type Key = keyof Settings;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function keysOf(settings: Settings): Key[] {
  return Object.keys(settings).filter((key): key is Key => key in settings);
}

/**
 * The settings a draft changed from the ones saved.
 *
 * @param draft - The settings as edited
 * @param saved - The settings saved
 * @returns The keys whose values differ
 * @example
 * ```ts
 * changedKeys({ ...saved, jsonIndent: 4 }, saved); // Set { "jsonIndent" }
 * ```
 */
export function changedKeys(draft: Settings, saved: Settings): ReadonlySet<Key> {
  return new Set(keysOf(draft).filter((key) => !same(draft[key], saved[key])));
}

/**
 * A draft moved onto settings saved elsewhere since it began — the theme
 * switched from the header, say: what the draft did not change follows the
 * new saved value, what it changed stays as edited.
 *
 * @param draft - The settings as edited
 * @param base - The saved settings the draft began from
 * @param saved - The settings saved now
 * @returns The draft on the new saved settings
 * @example
 * ```ts
 * rebase(draft, { ...base, theme: "dark" }, { ...base, theme: "light" }).theme; // "light" unless the draft changed it
 * ```
 */
export function rebase(draft: Settings, base: Settings, saved: Settings): Settings {
  const next: Settings = { ...saved };
  for (const key of changedKeys(draft, base)) Object.assign(next, { [key]: draft[key] });
  return next;
}

/**
 * What is wrong with an ignore pattern before it is added: nothing typed,
 * one already there, or text that is not a regular expression — Studio
 * tests each pattern as one against a request's URL.
 *
 * @param patterns - The patterns there are
 * @param raw - The pattern typed
 * @returns Why it cannot be added, or `null` when it can
 * @example
 * ```ts
 * patternProblem([], "*.png"); // "Not a regular expression: Nothing to repeat"
 * ```
 */
export function patternProblem(patterns: readonly string[], raw: string): string | null {
  const pattern = raw.trim();
  if (!pattern) return "Type a pattern first";
  if (patterns.includes(pattern)) return "That pattern is already ignored";
  try {
    new RegExp(pattern, "i");
    return null;
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message.replace(/^Invalid regular expression: \/.*\/\w*: /, "")
        : "";
    return `Not a regular expression${reason ? `: ${reason}` : ""}`;
  }
}
