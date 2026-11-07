/**
 * The calls of import.meta that may load code, each read from its own
 * text: where the reading tells what a call is without the file's whole
 * tree, and where it leaves that to the tree.
 */
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { metaCalls } from "../../../src/upgrade/entries/meta-calls";

/* Each call a text's import.meta makes that may load code, by its kind and where it starts; none where the text is left to its tree. */
function callsOf(text: string) {
  const metas = parseSync("piece.ts", text).module.importMetas;
  return metaCalls({ text, parseAs: ".ts", metas })?.map(({ node, at }) => [node.type, at]);
}

describe("the calls of import.meta read alone", () => {
  it("reads a glob's call and a new URL() from where each starts", () => {
    expect(callsOf('import.meta.glob("./a/*.ts");\nnew URL("./w.ts", import.meta.url);\n')).toEqual(
      [
        ["CallExpression", 0],
        ["NewExpression", 30],
      ],
    );
  });

  it("reads both of a new URL() inside another, each with its own start", () => {
    expect(
      callsOf('new URL(new URL("./inner.ts", import.meta.url).href, import.meta.url);\n'),
    ).toEqual([
      ["NewExpression", 8],
      ["NewExpression", 0],
    ]);
  });

  it("tells where import.meta loads nothing without the whole tree", () => {
    expect(callsOf("const mode = import.meta.env.MODE;\n")).toEqual([]);
    expect(callsOf("const here = fileURLToPath(import.meta.url);\n")).toEqual([]);
    expect(
      callsOf('new URL("https://shop.example");\nconst at = join(here, import.meta.url);\n'),
    ).toEqual([]);
    expect(callsOf("const glob = import.meta.glob;\n")).toEqual([]);
  });

  it("leaves to the whole tree a call whose end is not found within what is read of it", () => {
    const patterns = Array.from({ length: 40 }, (_, at) => `./part-${at})/*.ts`);

    expect(callsOf(`import.meta.glob(${JSON.stringify(patterns)});\n`)).toBeUndefined();
  });
});
