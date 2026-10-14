/**
 * The outputs a page loads at start: the entry and what it imports
 * statically, not what it imports when a call needs it.
 *
 * @param {Record<string, { imports: { path: string, kind: string }[] }>} outputs - esbuild's metafile outputs
 * @param {string} entry - The entry's output
 * @returns {Set<string>} The outputs loaded at start
 * @example
 * startClosure({ "a.js": { imports: [{ path: "b.js", kind: "import-statement" }] }, "b.js": { imports: [] } }, "a.js"); // Set { "a.js", "b.js" }
 */
export function startClosure(outputs, entry) {
  const seen = new Set();
  const visit = (output) => {
    if (seen.has(output) || !outputs[output]) return;
    seen.add(output);
    for (const imported of outputs[output].imports) {
      if (imported.kind === "import-statement") visit(imported.path);
    }
  };
  visit(entry);
  return seen;
}
