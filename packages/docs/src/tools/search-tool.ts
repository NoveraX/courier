import type { ServedTool } from "@noverax/courier-mcp/internal";

import { DOCS_LIMITS } from "../limits";
import { answer, type DocsSource, readTool, refused } from "./docs-source";

/**
 * `docs_search`: the parts of the docs that answer a search, best first.
 *
 * @param source - The docs
 * @returns The tool
 */
export function searchTool(source: DocsSource): ServedTool {
  return readTool({
    name: "docs_search",
    title: "Search the docs",
    description: `Find the parts of Courier's documentation that answer a question — a feature, an export's name, an option, an error's code — for the version this project installs. Each result names its page and heading, quotes the lines that match, and gives what docs_read takes to read it. Up to ${DOCS_LIMITS.maxResults} results, ${DOCS_LIMITS.defaultResults} by default.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: DOCS_LIMITS.queryChars,
          description: "What to look for, such as cancel previous request or createProxyCaller",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: DOCS_LIMITS.maxResults,
          description: `How many results, ${DOCS_LIMITS.defaultResults} by default`,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        version: { type: "string" },
        results: { type: "array", items: { type: "object" } },
      },
      required: ["version", "results"],
    },
    run: (args) =>
      answer(() => {
        const { query, limit = DOCS_LIMITS.defaultResults } = args;
        if (typeof query !== "string" || query.trim() === "")
          return refused("query is the words to look for");
        if (query.length > DOCS_LIMITS.queryChars) {
          return refused(`query is longer than ${DOCS_LIMITS.queryChars} characters`);
        }
        if (
          typeof limit !== "number" ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > DOCS_LIMITS.maxResults
        ) {
          return refused(`limit is a whole number from 1 to ${DOCS_LIMITS.maxResults}`);
        }
        const results = source.index().search(query, limit);
        return { ok: true, data: { version: source.docs().manifest.version, results } };
      }),
  });
}
