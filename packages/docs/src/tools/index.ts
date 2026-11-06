import { type ToolSet, toolSet } from "@noverax/courier-mcp/internal";

import { type DocsLoader, docsSource } from "./docs-source";
import { listTool } from "./list-tool";
import { readPageTool } from "./read-tool";
import { searchTool } from "./search-tool";

export type { DocsLoader } from "./docs-source";

/**
 * The docs as an agent's tools: search them, read a page or a part of it,
 * and list every page. Each only reads, from the folder installed with
 * the package — no network — and checks its arguments itself.
 *
 * @param load - Reads the docs folder
 * @returns The tools
 * @example
 * ```ts
 * docsTools(() => loadDocs(dir)).byName.get("docs_search");
 * ```
 */
export function docsTools(load: DocsLoader): ToolSet {
  const source = docsSource(load);
  return toolSet([searchTool(source), readPageTool(source), listTool(source)]);
}
