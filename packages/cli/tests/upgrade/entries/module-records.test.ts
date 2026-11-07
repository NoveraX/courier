/**
 * A file's record as the graph of imports reads it: what its
 * import.meta loads, whatever the text of each call holds, and a call
 * whose text runs past what is read of it alone.
 */
import { afterAll, describe, expect, it } from "vitest";

import { moduleRecord } from "../../../src/upgrade/entries/module-records";
import { projectWith, removeProjects } from "../../helpers/temp-project";

afterAll(removeProjects);

/* What a file's import.meta loads, as its one piece's record has it. */
function loadsOf(text: string) {
  const root = projectWith({ "src/main.ts": text });
  const record = moduleRecord(root, "src/main.ts");
  const [piece] = "pieces" in record ? record.pieces : [];
  return {
    patterns: piece?.globs.map((glob) => glob.patterns),
    imports: piece?.imports,
    madeUp: piece?.madeUp,
    unreadGlobs: piece?.unreadGlobs,
  };
}

describe("what a file's import.meta loads", () => {
  it("reads a glob whatever its call holds before its end: type arguments, a parenthesis in a string or a comment", () => {
    const text =
      'const a = import.meta.glob<Record<string, () => Promise<unknown>>>("./pages/*.tsx");\nconst b = import.meta.glob("./a(b)/*.ts");\nconst c = import.meta.glob("./x/*.ts", /* ) */ { eager: true });\n';

    expect(loadsOf(text).patterns).toEqual([["./pages/*.tsx"], ["./a(b)/*.ts"], ["./x/*.ts"]]);
  });

  it("reads the module new URL() names past a comment before its base, and one inside another", () => {
    const text =
      'new URL("./w.ts", /* base */ import.meta.url);\nnew URL("./v.ts", // base\n  import.meta.url);\nnew URL(new URL("./inner.ts", import.meta.url).href, import.meta.url);\n';

    expect(loadsOf(text).imports).toEqual(["./w.ts", "./v.ts", "./inner.ts"]);
  });

  it("reads nothing where import.meta.url is no new URL()'s base", () => {
    const text =
      'const page = new URL("https://shop.example/cart");\nconst here = fileURLToPath(import.meta.url);\nconst there = join(here, import.meta.url);\nconst nested = new URL("./a.ts", base(import.meta.url));\n';

    expect(loadsOf(text)).toMatchObject({ imports: [], madeUp: [], patterns: [] });
  });

  it("tells a glob it cannot read by its line, past characters of any width", () => {
    const wide = `${String.fromCodePoint(0x1f389)} ${String.fromCharCode(0x2014)}`;
    const text = `// ${wide}\nconst a = "${wide}";\nconst more = import.meta.glob(\`./more/\${name}.tsx\`);\n`;

    expect(loadsOf(text).unreadGlobs).toEqual([3]);
  });

  it("reads a glob whose call holds more parentheses than are tried for its end from the file's whole tree", () => {
    const patterns = Array.from({ length: 40 }, (_, at) => `./part-${at})/*.ts`);
    const text = `const parts = import.meta.glob(${JSON.stringify(patterns)});\nnew URL("./w.ts", import.meta.url);\n`;

    expect(loadsOf(text)).toMatchObject({ patterns: [patterns], imports: ["./w.ts"] });
  });
});
