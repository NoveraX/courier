/**
 * The code a file holds: all of it for a script, and for a Vue, Svelte or
 * Astro component its script blocks, each where it starts in the file.
 */
import { describe, expect, it } from "vitest";

import { scriptBlocks } from "../../src/server/editor/script-blocks";

describe("scriptBlocks", () => {
  it("reads a component's script block in the language its lang names", () => {
    const text = '<template><p /></template>\n<script setup lang="ts">\nconst a = 1;\n</script>\n';

    const [block] = scriptBlocks("Cart.vue", text);

    expect(block?.code).toBe("\nconst a = 1;\n");
    expect(block?.fileName).toBe("component.ts");
    expect(text.slice(block?.offset ?? 0).startsWith("\nconst a = 1;")).toBe(true);
  });

  it("ends a block at an end tag with white space or attributes before its bracket", () => {
    const text = [
      "<script>\nconst a = 1;\n</script >",
      '<script lang="js">b()</script\t\n bar>',
      "<script>c()</scripts></script>",
    ].join("\n<p>after</p>\n");

    const blocks = scriptBlocks("Page.svelte", text);

    expect(blocks.map((block) => block.code)).toEqual(["\nconst a = 1;\n", "b()", "c()</scripts>"]);
    expect(blocks.map((block) => block.fileName)).toEqual([
      "component.ts",
      "component.js",
      "component.ts",
    ]);
  });

  it("reads all of a script", () => {
    expect(scriptBlocks("api.ts", "export {};")).toEqual([
      { code: "export {};", offset: 0, fileName: "api.ts" },
    ]);
  });
});
