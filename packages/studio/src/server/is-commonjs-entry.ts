import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

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
 * file, or a `.js` file outside a `"type": "module"` package that has no ES
 * module syntax. Every other file — TypeScript, `.mjs`, a `.js` file in a
 * `"type": "module"` package or one with ES module syntax — is an ES module
 * to the loader.
 *
 * @param file - The file's absolute path
 * @param source - The file's text
 * @returns `true` when the file runs as CommonJS
 * @example
 * ```ts
 * isCommonJsEntry("/app/courier.config.cjs", "module.exports = {};\n"); // → true
 * isCommonJsEntry("/app/courier.config.js", "export default {};\n"); // → false
 * ```
 */
export function isCommonJsEntry(file: string, source: string): boolean {
  const extension = extname(file);
  if (extension === ".cjs") return true;
  if (extension !== ".js") return false;
  return packageTypeOf(file) !== "module" && !ESM_SYNTAX.test(source);
}

/* The `type` of the nearest package.json above the file. */
function packageTypeOf(file: string): unknown {
  for (let directory = dirname(file); ; directory = dirname(directory)) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) return readPackageType(manifest);
    if (dirname(directory) === directory) return undefined;
  }
}

/* A package.json that does not parse declares no type, as the loader reads it. */
function readPackageType(manifest: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
    return typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "type") : undefined;
  } catch (error) {
    log.debug(`${manifest} could not be read; its package is taken for CommonJS`, error);
    return undefined;
  }
}
