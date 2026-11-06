/**
 * The docs' MCP server, spoken to as a client speaks to it: opened with
 * `initialize` or, on the 2026-07-28 revision, without; its three tools,
 * which only read; their answers within the server's limit; arguments it
 * cannot take refused with why; and a damaged docs folder said so, with
 * the server still up.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type Connection, META } from "@noverax/courier-mcp/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DOCS_LIMITS } from "../src/limits";
import { MANIFEST_FILE } from "../src/manifest";
import { docsServer } from "../src/server";
import { type Bundled, bundled } from "./support/bundled";

let folder: Bundled;
let empty: string;
let ids = 0;

beforeAll(() => {
  folder = bundled();
  empty = mkdtempSync(join(tmpdir(), "courier-docs-empty-"));
});

afterAll(() => {
  folder.remove();
  rmSync(empty, { recursive: true, force: true });
});

type Server = ReturnType<typeof docsServer>;

/* How many pages the folder's manifest lists: the list answers with every one of them. */
function manifestPages(): number {
  const manifest = JSON.parse(readFileSync(join(folder.dir, MANIFEST_FILE), "utf8")) as {
    pages: unknown[];
  };
  return manifest.pages.length;
}

/* A client's connection over stdio, opened with `initialize`. */
async function opened(server: Server): Promise<Connection> {
  const connection: Connection = { transport: "stdio", listening: new Map() };
  await call(server, connection, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  });
  return connection;
}

async function call(
  server: Server,
  connection: Connection,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  ids += 1;
  const answer = await server.request(
    { jsonrpc: "2.0", id: ids, method, params },
    connection,
    new AbortController().signal,
  );
  if (answer === undefined || !("result" in answer))
    throw new Error(`No result: ${JSON.stringify(answer)}`);
  return answer.result as Record<string, unknown>;
}

async function tool(
  server: Server,
  connection: Connection,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await call(server, connection, "tools/call", { name, arguments: args });
  const [content] = result.content as { text: string }[];
  return { result, text: content?.text ?? "" };
}

describe("the docs server", () => {
  it("opens with initialize, naming itself and telling the model how its tools go together", async () => {
    const server = docsServer(folder.dir);
    const result = await call(server, { transport: "stdio", listening: new Map() }, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    expect(result.serverInfo).toMatchObject({ name: "courier-docs" });
    expect(result.instructions).toContain("docs_search");
  });

  it("offers three tools, each of which only reads", async () => {
    const server = docsServer(folder.dir);
    const listed = await call(server, await opened(server), "tools/list");
    const tools = listed.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
    expect(tools.map((t) => t.name)).toEqual(["docs_search", "docs_read", "docs_list"]);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("answers a search with the parts that match, as structured content", async () => {
    const server = docsServer(folder.dir);
    const { result } = await tool(server, await opened(server), "docs_search", {
      query: "browsers only",
      limit: 3,
    });
    const found = result.structuredContent as { version: string; results: unknown[] };
    expect(result.isError).toBe(false);
    expect(found.version).toBe("0.0.0-test");
    expect(found.results[0]).toMatchObject({
      page: "proxy-mode/rate-limits",
      section: "Browsers only",
    });
  });

  it("answers a read with the page's Markdown, and the list with every page by section", async () => {
    const server = docsServer(folder.dir);
    const connection = await opened(server);
    const { text } = await tool(server, connection, "docs_read", { page: "quick-start" });
    expect(text.startsWith("Courier 0.0.0-test docs · quick-start · Quick Start · ")).toBe(true);
    const { result } = await tool(server, connection, "docs_list", {});
    const sections = (result.structuredContent as { sections: { pages: unknown[] }[] }).sections;
    expect(sections.flatMap((section) => section.pages)).toHaveLength(manifestPages());
  });

  it.each([
    ["docs_search", { query: "" }, "query is the words to look for"],
    [
      "docs_search",
      { query: "x".repeat(DOCS_LIMITS.queryChars + 1) },
      "query is longer than 200 characters",
    ],
    ["docs_search", { query: "proxy", limit: 50 }, "limit is a whole number from 1 to 10"],
    ["docs_read", { page: 5 }, "page is a page of the docs, as docs_list names them"],
    ["docs_read", { page: "quick-start", offset: -1 }, "offset is a whole number, from 0"],
    [
      "docs_read",
      { page: "quick-start", section: 3 },
      "section is a heading of the page, or its anchor",
    ],
  ])("refuses %s with %j, saying why", async (name, args, message) => {
    const server = docsServer(folder.dir);
    const { result, text } = await tool(server, await opened(server), name, args);
    expect(result.isError).toBe(true);
    expect(text).toBe(message);
  });

  it("starts with a damaged docs folder, and its tools say to reinstall the package", async () => {
    const server = docsServer(empty);
    const { result, text } = await tool(server, await opened(server), "docs_list", {});
    expect(result.isError).toBe(true);
    expect(text).toBe("The docs folder has no manifest.json: reinstall @noverax/courier-docs");
  });

  it("serves a client on the 2026-07-28 revision, which names it in each request", async () => {
    const server = docsServer(folder.dir);
    const listed = await call(server, { transport: "stdio", listening: new Map() }, "tools/list", {
      _meta: {
        [META.protocolVersion]: "2026-07-28",
        [META.clientInfo]: { name: "test-client", version: "1.0.0" },
        [META.clientCapabilities]: {},
      },
    });
    expect((listed.tools as unknown[]).length).toBe(3);
  });

  it("answers every page's read, and every list, within its limit", async () => {
    const server = docsServer(folder.dir);
    const connection = await opened(server);
    const { text: list } = await tool(server, connection, "docs_list", {});
    expect(list.length).toBeLessThanOrEqual(DOCS_LIMITS.resultChars);
    const { text } = await tool(server, connection, "docs_read", { page: "studio/import-api" });
    expect(text.length).toBeLessThanOrEqual(DOCS_LIMITS.resultChars);
  });
});
