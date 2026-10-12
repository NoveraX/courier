/**
 * Under a finger every text field is 16px or more — the size below which
 * iOS zooms into a field as it takes focus, and leaves the page zoomed —
 * whatever size a class gives it: the rule sits outside any layer, so it
 * outranks the utilities, which a rule in `@layer base` would not.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BASE = readFileSync(join(import.meta.dirname, "../src/design/base.css"), "utf8");

/* The stylesheet with its `@layer` blocks taken out: what is left sits outside any layer. */
function outsideLayers(css: string): string {
  let out = "";
  let depth = 0;
  let layered = 0;
  for (let at = 0; at < css.length; at++) {
    if (depth === 0 && css.startsWith("@layer", at)) layered = 1;
    const char = css[at];
    if (char === "{") depth++;
    if (layered === 0) out += char;
    if (char === "}" && --depth === 0) layered = 0;
  }
  return out;
}

function touchRule(): { selectors: string[]; body: string } | null {
  const rule = /@media \(pointer: coarse\) \{\s*([^{}]+)\{([^}]*)\}/.exec(outsideLayers(BASE));
  if (!rule) return null;
  return {
    selectors: (rule[1] ?? "").split(/,\s*(?![^(]*\))/).map((part) => part.trim()),
    body: rule[2] ?? "",
  };
}

describe("base.css under a finger", () => {
  it("sets every input, text area and select at 16px, outside any layer", () => {
    const rule = touchRule();

    expect(rule?.body).toMatch(/font-size:\s*16px;/);
    expect(rule?.selectors).toEqual([expect.stringMatching(/^input:not\(/), "textarea", "select"]);
  });

  it("leaves out only the inputs that hold no text", () => {
    const input = touchRule()?.selectors[0] ?? "";
    const left = [...input.matchAll(/\[type="([a-z]+)"\]/g)].map(([, type]) => type);

    expect(left).toEqual(["checkbox", "radio", "range", "color", "file"]);
  });
});
