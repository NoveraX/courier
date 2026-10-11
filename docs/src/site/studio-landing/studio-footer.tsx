import { ProductFooter, type ProductFooterColumn } from "@/site/landing/product-footer"
import { STUDIO_DEMO_URL } from "@/site/site-url"
import { StudioWordmark } from "./header/studio-wordmark"

const REPO = "https://github.com/NoveraX/courier"

const COLUMNS: readonly ProductFooterColumn[] = [
  {
    heading: "Studio",
    links: [
      { label: "Live demo", href: STUDIO_DEMO_URL },
      { label: "Setup", href: "#setup" },
      { label: "Mock servers", href: "/docs/studio/mock-servers" },
      { label: "Import an API", href: "/docs/studio/import-api" },
      { label: "Contract drift", href: "/docs/studio/contract-drift" },
      { label: "Session files", href: "/docs/studio/session-files" },
      { label: "VS Code extension", href: "/docs/studio/editor" },
    ],
  },
  {
    heading: "Courier",
    links: [
      { label: "Overview", href: "/" },
      { label: "MCP server", href: "/mcp" },
      { label: "Docs", href: "/docs/introduction" },
      { label: "API reference", href: "/reference" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "GitHub", href: REPO },
      { label: "npm", href: "https://www.npmjs.com/package/@noverax/courier-studio" },
      { label: "MIT License", href: `${REPO}/blob/master/LICENSE` },
    ],
  },
]

/**
 * Studio's page's footer: its name and licence, and three columns of
 * links.
 *
 * @returns The footer
 * @example
 * ```tsx
 * <StudioFooter />
 * ```
 */
export function StudioFooter() {
  return (
    <ProductFooter
      brand={<StudioWordmark />}
      line="The visual debugger for @noverax/courier. MIT licensed."
      columns={COLUMNS}
    />
  )
}
