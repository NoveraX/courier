import { appendItem } from "./edit/insert";
import { propertyLiteral } from "./edit/literal";
import { nextCode, scanSource } from "./edit/source-scan";
import type { Project } from "./project/read-project";
import type { RecipeEdit, RecipeFile } from "./recipes/recipe-types";

/* Started by its package's full name, so npx runs the project's copy and never another package of that name. */
const SERVER = '"courier": { "command": "npx", "args": ["@noverax/courier-mcp"] }';

const MCP_JSON = `{
  "mcpServers": {
    ${SERVER}
  }
}
`;

/* Courier's server beside the servers the file lists, or the list added where it has none. */
function withCourierServer(text: string): string | undefined {
  if (text.includes("@noverax/courier-mcp")) return text;
  const scan = scanSource(text);
  const open = scan === undefined ? -1 : nextCode(scan, 0);
  const close = scan?.closer.get(open);
  if (scan === undefined || close === undefined || text[open] !== "{") return undefined;
  const servers = propertyLiteral(scan, { open, close }, "mcpServers");
  if (servers === undefined) return undefined;
  return servers === null
    ? appendItem(scan, { open, close }, `"mcpServers": { ${SERVER} }`)
    : appendItem(scan, servers, SERVER);
}

/**
 * The project's entry for Courier's MCP server in `.mcp.json`, which
 * Claude Code reads: the file, where the project has none, or Courier's
 * server added beside the servers the project's file lists already.
 *
 * @param project - The project
 * @returns The file to add, or the change to the project's own
 * @example
 * ```ts
 * mcpJsonEntry(project).files[0]?.path; // ".mcp.json", in a project without one
 * ```
 */
export function mcpJsonEntry(project: Project): {
  files: RecipeFile[];
  edits: RecipeEdit[];
} {
  if (!project.exists(".mcp.json")) {
    return {
      files: [
        {
          path: ".mcp.json",
          content: MCP_JSON,
          purpose: "the MCP server your editor's agent starts",
        },
      ],
      edits: [],
    };
  }
  const edit: RecipeEdit = {
    path: ".mcp.json",
    purpose: "adds Courier's MCP server beside the servers it lists",
    change: withCourierServer,
    manual: { file: ".mcp.json", what: "Add Courier's server under mcpServers", lines: [SERVER] },
  };
  return { files: [], edits: [edit] };
}
