import { withJsonStrings } from "../edit/json-strings";
import { isRecord } from "../is-record";
import type { RecipeEdit, ScriptRewrite } from "../recipes/recipe-types";

/* The indentation a JSON file is written with, so its next write keeps it. */
function indentOf(text: string): string {
  return /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
}

/*
 * package.json with the scripts added — each under a name it does not use
 * yet — and its own rewritten, edited in place so every other line stays as
 * the project wrote it; written out whole only where the file is laid out
 * in a way the edit does not read.
 */
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
  const before: Record<string, unknown> = isRecord(parsed.scripts) ? parsed.scripts : {};
  const scripts: Record<string, unknown> = { ...before };
  for (const [name, command] of Object.entries(add)) scripts[name] ??= command;
  for (const { script, change } of rewrites) {
    const command = scripts[script];
    if (typeof command === "string") scripts[script] = change(command);
  }
  const manifest = { ...parsed, scripts };
  if (JSON.stringify(parsed) === JSON.stringify(manifest)) return text;
  const changed = Object.fromEntries(
    Object.entries(scripts).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1] !== before[entry[0]],
    ),
  );
  const edited = withJsonStrings(text, "scripts", changed);
  if (edited !== undefined && JSON.stringify(JSON.parse(edited)) === JSON.stringify(manifest))
    return edited;
  return `${JSON.stringify(manifest, null, indentOf(text))}${text.endsWith("\n") ? "\n" : ""}`;
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
