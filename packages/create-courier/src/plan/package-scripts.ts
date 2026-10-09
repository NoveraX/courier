import { isRecord } from "../is-record";
import type { RecipeEdit, ScriptRewrite } from "../recipes/recipe-types";

/* The indentation a JSON file is written with, so its next write keeps it. */
function indentOf(text: string): string {
  return /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
}

/* package.json with the scripts added — each under a name it does not use yet — and its own rewritten. */
function withScripts(
  text: string,
  add: Readonly<Record<string, string>>,
  rewrites: readonly ScriptRewrite[],
): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const scripts: Record<string, unknown> = isRecord(parsed.scripts) ? { ...parsed.scripts } : {};
  for (const [name, command] of Object.entries(add)) scripts[name] ??= command;
  for (const { script, change } of rewrites) {
    const command = scripts[script];
    if (typeof command === "string") scripts[script] = change(command);
  }
  const manifest = { ...parsed, scripts };
  const after = `${JSON.stringify(manifest, null, indentOf(text))}${text.endsWith("\n") ? "\n" : ""}`;
  return JSON.stringify(parsed) === JSON.stringify(manifest) ? text : after;
}

/**
 * The change a setup makes to the project's package.json: the scripts it
 * adds — under names the project does not use yet — and the project's own
 * it rewrites, written in the file's indentation.
 *
 * @param add - The scripts to add, by name
 * @param rewrites - The project's scripts to change, and why
 * @returns The edit, or none where there is nothing to change
 * @example
 * ```ts
 * scriptsEdit({ studio: "courier-studio" }, []);
 * ```
 */
export function scriptsEdit(
  add: Readonly<Record<string, string>>,
  rewrites: readonly ScriptRewrite[],
): RecipeEdit[] {
  if (Object.keys(add).length === 0 && rewrites.length === 0) return [];
  const why = [
    ...(Object.keys(add).length > 0 ? ["adds Courier's scripts"] : []),
    ...rewrites.map((rewrite) => rewrite.why),
  ];
  return [
    {
      path: "package.json",
      purpose: why.join("; "),
      change: (text) => withScripts(text, add, rewrites),
      manual: {
        file: "package.json",
        what: "Add Courier's scripts",
        lines: Object.entries(add).map(([name, command]) => `"${name}": "${command}",`),
      },
    },
  ];
}
