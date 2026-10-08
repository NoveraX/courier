/** Where the MCP server is set up, and what that takes. */
export interface SetupTarget {
  id: "claude" | "cursor" | "vscode" | "codex" | "app"
  label: string
  /** Where the lines go. */
  file: string
  lang: "bash" | "json" | "toml" | "ts"
  code: string
  note: string
}

/**
 * Each place the MCP server is set up: four editors' agents over stdio,
 * and an application's own endpoint over HTTP.
 *
 * @example
 * ```ts
 * SETUP_TARGETS.map((t) => t.id) // ["claude", "cursor", "vscode", "codex", "app"]
 * ```
 */
export const SETUP_TARGETS: readonly SetupTarget[] = [
  {
    id: "claude",
    label: "Claude Code",
    file: "terminal · project root",
    lang: "bash",
    code: "claude mcp add courier --scope project -- npx courier-mcp --dotenv .env.local",
    note: "Writes .mcp.json, so everyone who works on the project gets the tools.",
  },
  {
    id: "cursor",
    label: "Cursor",
    file: ".cursor/mcp.json",
    lang: "json",
    code: JSON.stringify(
      {
        mcpServers: {
          courier: { command: "npx", args: ["courier-mcp", "--dotenv", ".env.local"] },
        },
      },
      null,
      2
    ),
    note: "Cursor starts the server in the project, and lists its tools in the agent's settings.",
  },
  {
    id: "vscode",
    label: "VS Code",
    file: ".vscode/mcp.json",
    lang: "json",
    code: JSON.stringify(
      {
        servers: {
          courier: {
            type: "stdio",
            command: "npx",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code fills in ${workspaceFolder} itself
            args: ["courier-mcp", "--cwd", "${workspaceFolder}", "--dotenv", ".env.local"],
          },
        },
      },
      null,
      2
    ),
    note: "Agent mode picks it up; --cwd names the project wherever VS Code starts it.",
  },
  {
    id: "codex",
    label: "Codex",
    file: "~/.codex/config.toml",
    lang: "toml",
    code: [
      "[mcp_servers.courier]",
      'command = "npx"',
      'args = ["courier-mcp", "--cwd", "/path/to/project", "--dotenv", ".env.local"]',
    ].join("\n"),
    note: "One entry per project, named by --cwd.",
  },
  {
    id: "app",
    label: "Your app",
    file: "app/mcp/route.ts",
    lang: "ts",
    code: [
      'import { createMcpHandler } from "@noverax/courier-mcp"',
      "",
      "const mcp = createMcpHandler({",
      '  authorize: (request) => apiKeys.verify(request.headers.get("authorization")),',
      '  allow: (tool, principal) => tool.access === "read" || principal.admin,',
      "})",
      "",
      "export const POST = mcp.handle",
      "export const GET = mcp.handle",
      "export const OPTIONS = mcp.handle",
    ].join("\n"),
    note: "Streamable HTTP for the agents your users and services run, behind your authorization.",
  },
]
