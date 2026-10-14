import type { ParsedSpec } from "../parser/types";
import { firstParagraph } from "./first-paragraph";
import { jsdocText } from "./jsdoc-text";

/** How a caller reaches the API, as its comment says it. */
const MODES = {
  DIRECT: "Calls the API directly from the runtime environment (browser, Node.js, Deno, Bun).",
  PROXY:
    "Routes requests through a server-side proxy endpoint. Hides secrets, bypasses CORS, and forwards only the headers a source names. This module takes the source's routes from the routes module, so a browser bundle holds no part of the source: import the proxy caller from here in browser code.",
} as const;

/**
 * The comment above a generated caller: the API, how the caller reaches
 * it, and the API's description summed up.
 *
 * @param spec - The parsed specification
 * @param mode - How the caller reaches the API
 * @returns The comment's lines
 * @example
 * ```ts
 * callerDoc(spec, "PROXY")[1]; // → " * `PROXY` — Shop v1"
 * ```
 */
export function callerDoc(spec: ParsedSpec, mode: keyof typeof MODES): string[] {
  const short = firstParagraph(spec.description) || spec.title;
  const lines = ["/**", ` * \`${mode}\` — ${jsdocText(spec.title)} v${jsdocText(spec.version)}`];
  lines.push(" *", ` * ${MODES[mode]}`);
  if (short) lines.push(" *", " * ---", " *", ` * ${jsdocText(short)}`);
  lines.push(" */");
  return lines;
}
