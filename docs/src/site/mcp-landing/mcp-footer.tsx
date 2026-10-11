import { ProductFooter, type ProductFooterColumn } from "@/site/landing/product-footer"
import { McpWordmark } from "./header/mcp-wordmark"

const REPO = "https://github.com/NoveraX/courier"

const COLUMNS: readonly ProductFooterColumn[] = [
  {
    heading: "MCP server",
    links: [
      { label: "Setup", href: "#setup" },
      { label: "Mark endpoints", href: "/docs/agents/overview" },
      { label: "In your editor", href: "/docs/agents/editor" },
      { label: "In your app", href: "/docs/agents/app" },
      { label: "Studio for your agent", href: "/docs/agents/studio" },
      { label: "Security model", href: "/docs/security/overview" },
    ],
  },
  {
    heading: "Courier",
    links: [
      { label: "Overview", href: "/" },
      { label: "Courier Studio", href: "/studio" },
      { label: "VS Code extension", href: "/docs/studio/editor" },
      { label: "Docs", href: "/docs/introduction" },
      { label: "API reference", href: "/reference" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "GitHub", href: REPO },
      { label: "npm", href: "https://www.npmjs.com/package/@noverax/courier-mcp" },
      { label: "MIT License", href: `${REPO}/blob/master/LICENSE` },
    ],
  },
]

/**
 * The MCP server's page's footer: its name and licence, and three columns
 * of links — its own docs first.
 *
 * @returns The footer
 * @example
 * ```tsx
 * <McpFooter />
 * ```
 */
export function McpFooter() {
  return (
    <ProductFooter
      brand={<McpWordmark />}
      line="Your API's endpoints as tools for AI agents, through your middleware. MIT licensed."
      columns={COLUMNS}
    />
  )
}
