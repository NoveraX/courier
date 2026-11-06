import type { ServedTool } from "@noverax/courier-mcp/internal";

import { DOCS_LIMITS } from "../limits";
import { readPage } from "../read-page";
import { answer, type DocsSource, readTool, refused } from "./docs-source";

/**
 * `docs_read`: a page of the docs, or a part of it, as Markdown, in pieces when it is long.
 *
 * @param source - The docs
 * @returns The tool
 */
export function readPageTool(source: DocsSource): ServedTool {
  return readTool({
    name: "docs_read",
    title: "Read a docs page",
    description: `Read a page of Courier's documentation, or one part of it under a heading, as Markdown: by the page docs_search or docs_list names, or by a link in another page (/docs/<page>#<anchor>). A page longer than ${DOCS_LIMITS.readChars} characters is read in pieces: the first line of each says where to read on from.`,
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          minLength: 1,
          maxLength: 300,
          description:
            "The page: core-concepts/caller, /docs/core-concepts/caller#direct-mode, or its address on the site",
        },
        section: {
          type: "string",
          maxLength: 200,
          description: "One part of the page, by its heading's words or its anchor",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Where to read on from, as the piece before said",
        },
      },
      required: ["page"],
      additionalProperties: false,
    },
    run: (args) =>
      answer(() => {
        const { page, section, offset } = args;
        if (typeof page !== "string" || page.trim() === "" || page.length > 300) {
          return refused("page is a page of the docs, as docs_list names them");
        }
        if (section !== undefined && (typeof section !== "string" || section.length > 200)) {
          return refused("section is a heading of the page, or its anchor");
        }
        if (
          offset !== undefined &&
          (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0)
        ) {
          return refused("offset is a whole number, from 0");
        }
        const read = readPage(source.docs(), { page, section, offset });
        return read.ok ? { ok: true, data: read.text } : refused(read.message);
      }),
  });
}
