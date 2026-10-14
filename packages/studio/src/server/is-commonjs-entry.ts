import { extname } from "node:path";
import { packageTypeOf } from "@noverax/courier-cli/devkit";

/* The test the loader applies to a `.js` file outside a `"type": "module"`
   package: source it matches is transpiled as an ES module, and source it
   does not is handed to Node first, which runs it as CommonJS. Deciding with
   the loader's own test is what makes Studio hand a file to Node first
   exactly when the runtime's loader does. */
const ESM_SYNTAX =
  /(?:[\s;]|^)(?:import[\s\w*,{}]*from|import\s*["'*{]|export\b\s*(?:[*{]|default|class|type|function|const|var|let|async function)|import\.meta\b)/m;

/**
 * Whether the runtime's loader hands a `courier.config.*` or `courier.mocks.*`
 * file to Node to run as CommonJS before it would transpile it: a `.cjs`
 * file, or a `.js` file outside a `"type": "module"` package, that has no ES
 * module syntax. Every other file — TypeScript, `.mjs`, a `.js` file in a
 * `"type": "module"` package, or one with ES module syntax — is an ES module
 * to the loader.
 *
 * A file with ES module syntax cannot run as CommonJS, so it is not handed to
 * Node: Node would refuse it, and for a `.cjs` file warn twice of an ES module
 * it could not load, with advice that does not apply, before the loader
 * transpiled it anyway.
 *
 * @param file - The file's absolute path
 * @param source - The file's text
 * @returns `true` when the file runs as CommonJS
 * @example
 * ```ts
 * isCommonJsEntry("/app/courier.config.cjs", "module.exports = {};\n"); // → true
 * isCommonJsEntry("/app/courier.config.cjs", "export default {};\n"); // → false
 * ```
 */
export function isCommonJsEntry(file: string, source: string): boolean {
  const extension = extname(file);
  if (extension !== ".cjs" && extension !== ".js") return false;
  if (ESM_SYNTAX.test(source)) return false;
  return extension === ".cjs" || packageTypeOf(file) !== "module";
}
