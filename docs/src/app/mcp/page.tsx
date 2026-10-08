import type { Metadata } from "next"

import { McpLandingPage } from "@/site/mcp-landing/mcp-landing-page"

export const metadata: Metadata = {
  title: { absolute: "Courier MCP server — your API, as tools for AI agents" },
  description:
    "Mark the endpoints an agent may call. Courier serves them over MCP to Claude Code, Cursor and every MCP client — typed from your schemas, run through your middleware, confirmed by a person before anything is undone.",
}

export default function Page() {
  return <McpLandingPage />
}
