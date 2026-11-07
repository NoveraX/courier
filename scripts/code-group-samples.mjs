/// <reference types="node" />
/**
 * The TypeScript tabs of a page's tabbed code, as samples for
 * `scripts/check-doc-samples.mjs` to compile beside its fences.
 *
 * A page writes tabbed code as `<CodeGroup items={[{ label, code, language }]} />`,
 * and a tab's language is `ts` unless it names another. The tabs hold code
 * as string props, not fences, so for a year the six framework setups of
 * the server handler's page were compiled by nothing, and read as empty by
 * the Markdown the site hands on. TypeScript parses the props here, the way
 * the page's own JSX is parsed.
 */

import { createRequire } from "node:module";

import { sampleFile } from "./page-modules.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const TYPESCRIPT = new Set(["ts", "tsx", "typescript"]);
const FENCE = /^([ \t]*)```[^\n]*\n[\s\S]*?^\1```/gm;
const COMPONENT = "<CodeGroup";

/**
 * Every TypeScript tab of the tabbed code a page writes outside its fences.
 *
 * @param {string} text - The page
 * @returns {Array<{ line: number, jsx: boolean, listing: boolean, flat: boolean, code: string, file?: string }>}
 *   Each tab: the line its code starts on, whether it holds JSX, its code,
 *   the file its first line names, and whether the code is written on that
 *   one line, its line ends escaped
 * @example
 * codeGroupSamples('<CodeGroup items={[{ label: "Hono", code: "const a = 1\\n" }]} />');
 * // → [{ line: 1, jsx: false, listing: false, flat: true, code: "const a = 1\n", file: undefined }]
 */
export function codeGroupSamples(text) {
  return componentsOf(text).flatMap((component) => tabsOf(text, component));
}

/**
 * Where a page writes tabbed code outside its fences: each component, from
 * its tag to its end, whose code is no prose of the page.
 *
 * @param {string} text - The page
 * @returns {Array<[number, number]>} Each component's start and end, offsets of the text
 * @example
 * codeGroupSpans('Intro\n<CodeGroup items={[]} />\n'); // → [[6, 30]]
 */
export function codeGroupSpans(text) {
  return componentsOf(text).map(({ start, element }) => [start, start + element.getEnd()]);
}

/* Each tabbed code component a page writes outside its fences: where it opens, and its element as parsed from there. */
function componentsOf(text) {
  const fenced = [...text.matchAll(FENCE)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
  const components = [];
  for (
    let start = text.indexOf(COMPONENT);
    start >= 0;
    start = text.indexOf(COMPONENT, start + 1)
  ) {
    if (fenced.some(([from, to]) => start >= from && start < to)) continue;
    const source = ts.createSourceFile(
      "tabs.tsx",
      text.slice(start),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const element = elementAtStart(source, source);
    if (element) components.push({ start, source, element });
  }
  return components;
}

/* The TypeScript tabs of a component. */
function tabsOf(text, { start, source, element }) {
  const items = propArray(element, "items");
  return (items?.elements ?? []).flatMap((item) => {
    if (!ts.isObjectLiteralExpression(item)) return [];
    const code = literal(item, "code");
    if (!code || !TYPESCRIPT.has(literal(item, "language")?.text ?? "ts")) return [];
    const side = literal(item, "side")?.text;
    const written = code.getText(source);
    const line = text.slice(0, start + code.getStart(source)).split("\n").length;
    return [
      {
        line,
        jsx: /<\/[A-Za-z]|\/>/.test(code.text),
        listing: false,
        flat: !written.includes("\n"),
        code: code.text,
        file: sampleFile("", code.text),
        ...(side !== undefined && { side }),
      },
    ];
  });
}

/* The component itself: the page goes on after it, and its next tag can read as a comparison with it. */
function elementAtStart(node, source) {
  if (ts.isJsxSelfClosingElement(node) && node.getStart(source) === 0) return node;
  return ts.forEachChild(node, (child) =>
    child.getStart(source) === 0 ? elementAtStart(child, source) : undefined,
  );
}

/* The array literal a JSX prop holds: `items={[…]}`. */
function propArray(element, name) {
  const prop = element.attributes.properties.find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
  );
  const value = prop && ts.isJsxAttribute(prop) ? prop.initializer : undefined;
  const expression = value && ts.isJsxExpression(value) ? value.expression : undefined;
  return expression && ts.isArrayLiteralExpression(expression) ? expression : undefined;
}

/* The string literal, or template literal without substitutions, a key of an object literal holds. */
function literal(object, key) {
  const property = object.properties.find(
    (entry) => ts.isPropertyAssignment(entry) && entry.name.getText() === key,
  );
  const value = property && ts.isPropertyAssignment(property) ? property.initializer : undefined;
  return value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
    ? value
    : undefined;
}
