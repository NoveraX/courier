import { fileURLToPath } from "node:url";

import { createMcpServer, type McpServer, requestStates } from "@noverax/courier-mcp/internal";

import { loadDocs } from "./docs";
import { DOCS_LIMITS } from "./limits";
import { packageVersion } from "./package-version";
import { docsTools } from "./tools";

/** Where the package keeps its docs: beside its code, as it is installed. */
export const DOCS_DIR = fileURLToPath(new URL("../docs", import.meta.url));

const HOW_TO =
  "Find the part of it that answers a question with docs_search, then read that page, or the part under one heading, with docs_read; " +
  "docs_list lists every page by section.";

/**
 * The docs' MCP server: three tools that only read the docs folder — a
 * search, a page's read and the list of every page — each answer within
 * the server's limit. It reads the folder as the first call asks for it,
 * so a server whose folder is damaged still starts and says so.
 *
 * @param dir - The docs folder: the package's own by default
 * @param installed - The version of `@noverax/courier` the project installs,
 *   where it is known: the model is told of one that is not the docs'
 * @returns The protocol server, for a transport to serve
 * @example
 * ```ts
 * await serveStdio(docsServer(DOCS_DIR, "0.6.0"), { input: process.stdin, write });
 * ```
 */
export function docsServer(dir: string = DOCS_DIR, installed?: string): McpServer {
  const tools = docsTools(() => loadDocs(dir));
  const other = versionNote(installed);
  return createMcpServer({
    info: { name: "courier-docs", version: packageVersion() },
    instructions:
      other === undefined
        ? `Courier's documentation for the version this project installs, read from the package with no network. ${HOW_TO}`
        : `Courier's documentation, read from the package with no network. ${other} ${HOW_TO}`,
    tools: () => tools,
    allowDestructive: false,
    states: requestStates(crypto.getRandomValues(new Uint8Array(32))),
    maxResultChars: DOCS_LIMITS.resultChars,
    transport: "stdio",
  });
}

/**
 * What the docs say to a project that installs another version of Courier
 * than theirs, and where its own are.
 *
 * @param installed - The version of `@noverax/courier` the project installs, where it is known
 * @returns The sentence, or `undefined` for the docs' own version or one not known
 * @example
 * ```ts
 * versionNote("0.5.0"); // "These docs are for Courier 0.6.0, and this project installs …"
 * ```
 */
export function versionNote(installed: string | undefined): string | undefined {
  const version = packageVersion();
  if (installed === undefined || installed === version) return undefined;
  return `These docs are for Courier ${version}, and this project installs @noverax/courier ${installed}: where the two differ, they do not describe its code. @noverax/courier-docs@${installed} holds the docs for it.`;
}
