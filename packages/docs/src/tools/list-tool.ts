import type { ServedTool } from "@noverax/courier-mcp/internal";

import { answer, type DocsSource, readTool } from "./docs-source";

/**
 * `docs_list`: every page of the docs, by section.
 *
 * @param source - The docs
 * @returns The tool
 */
export function listTool(source: DocsSource): ServedTool {
  return readTool({
    name: "docs_list",
    title: "List the docs",
    description:
      "Every page of Courier's documentation for the version this project installs, by section: each page's id, which docs_read takes, its title and what it covers.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        version: { type: "string" },
        sections: { type: "array", items: { type: "object" } },
      },
      required: ["version", "sections"],
    },
    run: () =>
      answer(() => {
        const { manifest } = source.docs();
        const sections = new Map<string, { page: string; title: string; description: string }[]>();
        for (const page of manifest.pages) {
          const pages = sections.get(page.section) ?? [];
          pages.push({ page: page.id, title: page.title, description: page.description });
          sections.set(page.section, pages);
        }
        return {
          ok: true,
          data: {
            version: manifest.version,
            sections: [...sections].map(([section, pages]) => ({ section, pages })),
          },
        };
      }),
  });
}
