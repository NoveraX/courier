/// <reference types="node" />
/**
 * Where the documentation's TypeScript samples are, and how each becomes a
 * module of its own for `scripts/check-doc-samples.mjs` to compile.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* A fence may sit indented inside a component; its closing fence matches the opening indent. */
const FENCE = /^([ \t]*)```(ts|tsx|typescript)\b([^\n]*)\n([\s\S]*?)^\1```/gm;

/**
 * Every ts, tsx and typescript fence of a Markdown or MDX text.
 *
 * @param {string} text - The page
 * @returns {Array<{ line: number, jsx: boolean, code: string }>} Each sample,
 *   the line of its first code line, whether it holds JSX, and its code
 *   without the fence's indentation
 * @example
 * extractSamples("# A\n\n```ts\nconst a = 1\n```\n");
 * // → [{ line: 4, jsx: false, code: "const a = 1\n" }]
 */
export function extractSamples(text) {
  return [...text.matchAll(FENCE)].map((match) => {
    const indent = match[1] ?? "";
    const code = (match[4] ?? "")
      .split("\n")
      .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
      .join("\n");
    /* A ts fence that holds JSX is read as tsx: the fence's name is a nit, not a failure. */
    const jsx = match[2] === "tsx" || /<\/[A-Za-z]|\/>/.test(code);
    return { line: text.slice(0, match.index).split("\n").length + 1, jsx, code };
  });
}

/**
 * The pages that hold samples: the docs site's pages and every README.
 *
 * @param {string} root - The repository root
 * @returns {string[]} Absolute paths
 * @example
 * samplePages("/repo"); // → ["/repo/docs/src/content/docs/quick-start.mdx", …, "/repo/README.md", …]
 */
export function samplePages(root) {
  const readmes = readdirSync(join(root, "packages"))
    .map((name) => join(root, "packages", name, "README.md"))
    .filter((path) => existsSync(path));
  return [...mdxFiles(join(root, "docs/src/content/docs")), join(root, "README.md"), ...readmes];
}

/**
 * The import lines a sample is missing, for names a package exports.
 *
 * @param {Iterable<string>} missing - Names the sample uses without declaring them
 * @param {Map<string, string>} exported - Each exported name and the entry that exports it
 * @returns {string[]} One `import { … } from "…"` line per entry
 * @example
 * importHeader(["defineApi", "courier", "users"], new Map([["defineApi", "@noverax/courier/define"], ["courier", "@noverax/courier/define"]]));
 * // → ['import { defineApi, courier } from "@noverax/courier/define";']
 */
export function importHeader(missing, exported) {
  const byEntry = new Map();
  for (const name of new Set(missing)) {
    const entry = exported.get(name);
    if (entry) byEntry.set(entry, [...(byEntry.get(entry) ?? []), name]);
  }
  return [...byEntry].map(([entry, names]) => `import { ${names.join(", ")} } from "${entry}";`);
}

function mdxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(path);
    return entry.name.endsWith(".mdx") ? [path] : [];
  });
}
