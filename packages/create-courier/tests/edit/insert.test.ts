import { describe, expect, it } from "vitest";

import { appendItem } from "../../src/edit/insert";
import type { Literal } from "../../src/edit/literal";
import { type SourceScan, scanSource } from "../../src/edit/source-scan";

/* The file scanned, and the literal its first `[` opens. */
function listIn(text: string): { scan: SourceScan; list: Literal } {
  const scan = scanSource(text);
  const open = text.indexOf("[");
  const close = scan?.closer.get(open);
  if (scan === undefined || close === undefined) throw new Error("no list");
  return { scan, list: { open, close } };
}

describe("appendItem", () => {
  it("adds an item after a list's strings, which are items as a call is", () => {
    const { scan, list } = listIn("modules: ['@nuxt/eslint', '@nuxt/ui'],\n");

    expect(appendItem(scan, list, "courierRoutesModule")).toBe(
      "modules: ['@nuxt/eslint', '@nuxt/ui', courierRoutesModule],\n",
    );
  });

  it("adds an item on a line of its own after strings laid out one to a line", () => {
    const { scan, list } = listIn("modules: [\n  '@nuxt/eslint',\n  '@nuxt/ui'\n],\n");

    expect(appendItem(scan, list, "courierRoutesModule")).toBe(
      "modules: [\n  '@nuxt/eslint',\n  '@nuxt/ui',\n  courierRoutesModule\n],\n",
    );
  });
});
