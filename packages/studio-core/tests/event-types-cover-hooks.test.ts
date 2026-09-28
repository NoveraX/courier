/**
 * Studio validates incoming runtime events against `RUNTIME_EVENT_TYPES` and
 * drops anything it does not recognise. When that list was maintained apart
 * from the hooks, it fell behind and silently discarded every request event a
 * runtime sent — Timeline, Waterfall, Analytics and the Playground catalogue
 * all sat empty while the application was plainly serving traffic.
 *
 * This reads what the hooks actually emit, so the two cannot drift again.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RUNTIME_EVENT_TYPES } from "../src/runtime/event-types";

const HOOKS_DIR = join(import.meta.dirname, "..", "src", "runtime", "hooks");

/** Every `type: "..."` literal the hook sources emit. */
function emittedTypes(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(HOOKS_DIR)) {
    if (!file.endsWith(".ts")) continue;
    const source = readFileSync(join(HOOKS_DIR, file), "utf8");
    for (const match of source.matchAll(/\btype:\s*"([a-z][a-z:-]*)"/g)) {
      found.add(match[1] as string);
    }
  }
  return [...found].sort();
}

describe("the runtime event list", () => {
  it("finds the hook sources at all", () => {
    expect(emittedTypes().length).toBeGreaterThan(10);
  });

  it("covers every type the hooks emit", () => {
    const missing = emittedTypes().filter((type) => !RUNTIME_EVENT_TYPES.includes(type));

    expect(missing, `not in RUNTIME_EVENT_TYPES: ${missing.join(", ")}`).toEqual([]);
  });

  /** A name left behind after a hook stops emitting it widens what Studio accepts. */
  it("lists nothing the hooks no longer emit", () => {
    const emitted = new Set(emittedTypes());
    const stale = RUNTIME_EVENT_TYPES.filter((type) => !emitted.has(type));

    expect(stale, `no hook emits: ${stale.join(", ")}`).toEqual([]);
  });

  it("has no duplicates", () => {
    expect(new Set(RUNTIME_EVENT_TYPES).size).toBe(RUNTIME_EVENT_TYPES.length);
  });
});
