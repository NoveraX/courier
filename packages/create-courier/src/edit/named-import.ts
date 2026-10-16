import { appendItem } from "./insert";
import { regexText } from "./regex-text";
import { codeMatches, type SourceScan } from "./source-scan";

/**
 * Add a name to a file's `import { … } from "module"`, where it does not
 * import it yet.
 *
 * @param scan - The scanned file
 * @param from - The module
 * @param name - The name
 * @returns The file with the name imported; the file itself where it is already; `undefined` where it has no such import, or more than one
 * @example
 * ```ts
 * addNamedImport(scan, "@react-router/dev/routes", "route");
 * // 'import { type RouteConfig, index } …' → 'import { type RouteConfig, index, route } …'
 * ```
 */
export function addNamedImport(scan: SourceScan, from: string, name: string): string | undefined {
  const escaped = regexText(from);
  const imports = codeMatches(
    scan,
    new RegExp(`^import\\s*(?:type\\s+)?\\{[^}]*\\}\\s*from\\s*["']${escaped}["']`, "gm"),
  );
  const found = imports[0];
  if (imports.length !== 1 || found === undefined) return undefined;
  const open = scan.text.indexOf("{", found.index);
  const close = scan.closer.get(open);
  if (close === undefined) return undefined;
  const names = scan.text
    .slice(open + 1, close)
    .split(",")
    .map(
      (part) =>
        part
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0],
    );
  return names.includes(name) ? scan.text : appendItem(scan, { open, close }, name);
}
