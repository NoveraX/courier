import { pathToFileURL } from "node:url";
import { type FileFormatter, toolApi } from "./tool-api";

interface LintResult {
  output?: string;
  messages: Array<{ fatal?: boolean; message: string }>;
}

interface ESLintInstance {
  lintText: (text: string, options: Record<string, unknown>) => Promise<LintResult[]>;
}

type ESLintClass = new (options: Record<string, unknown>) => ESLintInstance;

function isClass(value: unknown): value is ESLintClass {
  return typeof value === "function";
}

/* ESLint's API: it exports its class, and `loadESLint` since 8.57. */
function isESLintApi(value: unknown): value is object {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  return isClass(Reflect.get(value, "ESLint")) || isClass(Reflect.get(value, "loadESLint"));
}

/* The ESLint class for the project's configuration: flat or legacy, as `loadESLint` decides where it exists. */
async function eslintClass(api: object, root: string): Promise<ESLintClass> {
  const load: unknown = Reflect.get(api, "loadESLint");
  const chosen: unknown =
    typeof load === "function"
      ? await Reflect.apply(load, api, [{ cwd: root }])
      : Reflect.get(api, "ESLint");
  if (!isClass(chosen)) throw new Error("the module has no ESLint class");
  return chosen;
}

/**
 * Load the project's ESLint once and apply its fixes with it: each file
 * linted at its path by the project's configuration, every fix its rules
 * offer applied, as `eslint --fix` applies them. A file the configuration
 * ignores stays as it is; one ESLint cannot read is refused with the
 * reason, so it is written as Studio composed it.
 *
 * @param module - The module the project resolves ESLint from
 * @param root - The project root, where ESLint finds its configuration
 * @returns The formatter
 * @throws {Error} When the module is not ESLint
 * @example
 * ```ts
 * const fix = await eslintFormatter("/app/node_modules/eslint/lib/api.js", "/app");
 * ```
 */
export async function eslintFormatter(module: string, root: string): Promise<FileFormatter> {
  const api = toolApi(await import(pathToFileURL(module).href), isESLintApi);
  if (api === null) throw new Error(`${module} is not ESLint`);
  const Linter = await eslintClass(api, root);
  const eslint = new Linter({ cwd: root, fix: true });
  return async (path, text) => {
    const [result] = await eslint.lintText(text, { filePath: path, warnIgnored: false });
    if (result === undefined) return text;
    const fatal = result.messages.find((message) => message.fatal === true);
    if (fatal) throw new Error(`it cannot read the file: ${fatal.message}`);
    return result.output ?? text;
  };
}
