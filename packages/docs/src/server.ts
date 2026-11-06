import { fileURLToPath } from "node:url";

import { createMcpServer, type McpServer, requestStates } from "@noverax/courier-mcp/internal";

import { loadDocs } from "./docs";
import { DOCS_LIMITS } from "./limits";
import { packageVersion } from "./package-version";
import { docsTools } from "./tools";

/** Where the package keeps its docs: beside its code, as it is installed. */
export const DOCS_DIR = fileURLToPath(new URL("../docs", import.meta.url));

const INSTRUCTIONS =
  "Courier's documentation for the version this project installs, read from the package with no network. " +
  "Find the part of it that answers a question with docs_search, then read that page, or the part under one heading, with docs_read; " +
  "docs_list lists every page by section.";

/**
 * The docs' MCP server: three tools that only read the docs folder — a
 * search, a page's read and the list of every page — each answer within
 * the server's limit. It reads the folder as the first call asks for it,
 * so a server whose folder is damaged still starts and says so.
 *
 * @param dir - The docs folder: the package's own by default
 * @returns The protocol server, for a transport to serve
 * @example
 * ```ts
 * await serveStdio(docsServer(), { input: process.stdin, write });
 * ```
 */
export function docsServer(dir: string = DOCS_DIR): McpServer {
  const tools = docsTools(() => loadDocs(dir));
  return createMcpServer({
    info: { name: "courier-docs", version: packageVersion() },
    instructions: INSTRUCTIONS,
    tools: () => tools,
    allowDestructive: false,
    states: requestStates(crypto.getRandomValues(new Uint8Array(32))),
    maxResultChars: DOCS_LIMITS.resultChars,
    transport: "stdio",
  });
}
