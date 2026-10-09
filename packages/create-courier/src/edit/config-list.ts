import { type CodeStyle, codeStyleOf } from "./code-style";
import { addImportLine, appendItem } from "./insert";
import { defaultExportLiteral, type Literal, propertyLiteral } from "./literal";
import { type SourceScan, scanSource } from "./source-scan";

/** An item to add to a list in the object a config file exports, and the import it needs. */
export interface ConfigListItem {
  /** The functions the config is passed to: `defineConfig`. */
  readonly callees: readonly string[];
  /** The list's key: `plugins`, `integrations`, `modules`. */
  readonly property: string;
  /** The item, written in the file's style. */
  readonly item: (style: CodeStyle) => string;
  /** The import the item needs, written in the file's style. */
  readonly importLine?: (style: CodeStyle) => string;
}

/* The list under the key, created where the object has none; `undefined` where its value is not an array literal. */
function withItem(scan: SourceScan, config: Literal, add: ConfigListItem, item: string) {
  const list = propertyLiteral(scan, config, add.property);
  if (list === null) return appendItem(scan, config, `${add.property}: [${item}]`);
  if (list === undefined || scan.text[list.open] !== "[") return undefined;
  return appendItem(scan, list, item);
}

/**
 * Add an item to a list in the object a config file exports — a plugin to
 * Vite's `plugins`, an integration to Astro's `integrations` — with the
 * import it needs, both in the file's own style. Where the object has no
 * such list, the list is added with the item in it.
 *
 * @param text - The config file
 * @param add - The item, its list and its import
 * @returns The file with the item added, or `undefined` where the file is not in a shape this knows: one `export default` of an object literal, or of a call to one of `callees` with one
 * @example
 * ```ts
 * addToConfigList("export default defineConfig({ plugins: [react()] })", plugin);
 * // 'import { courierStudio } from "@noverax/courier-studio/react"\n\nexport default defineConfig({ plugins: [react(), courierStudio()] })'
 * ```
 */
export function addToConfigList(text: string, add: ConfigListItem): string | undefined {
  const style = codeStyleOf(text);
  const scan = scanSource(text);
  const config = scan === undefined ? undefined : defaultExportLiteral(scan, add.callees);
  if (scan === undefined || config === undefined || text[config.open] !== "{") return undefined;
  const changed = withItem(scan, config, add, add.item(style));
  if (changed === undefined || add.importLine === undefined) return changed;
  const rescanned = scanSource(changed);
  return rescanned === undefined ? undefined : addImportLine(rescanned, add.importLine(style));
}
