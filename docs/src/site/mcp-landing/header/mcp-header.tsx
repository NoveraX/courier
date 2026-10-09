import { PageHeader } from "@/site/landing/header/page-header"
import { MCP_INSTALL } from "@/site/mcp-landing/hero/mcp-hero"
import { McpWordmark } from "./mcp-wordmark"

/**
 * The bar across the top of the MCP server's page: its name, its guide
 * and Courier's two products with the MCP server marked as this page, the
 * way back to the Courier library, the menu on a narrow screen, the colour
 * theme, the repository and the way to set it up, further down the page.
 *
 * @returns The header and its menu
 * @example
 * ```tsx
 * <McpHeader />
 * ```
 */
export function McpHeader() {
  return (
    <PageHeader
      page="/mcp"
      brand={<McpWordmark />}
      brandLabel="Courier MCP server"
      action={{ label: "Set it up", href: "#setup" }}
      install={MCP_INSTALL}
    />
  )
}
