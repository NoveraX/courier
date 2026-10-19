import type { Metadata } from "next"
import { coreVersion } from "@/site/content/version"
import { McpLandingPage } from "@/site/mcp-landing/mcp-landing-page"
import { JsonLd } from "@/site/seo/json-ld"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"
import { MCP_PACKAGE } from "@/site/seo/structured-data/packages"
import { landingGraph } from "@/site/seo/structured-data/page-graphs"

export const metadata: Metadata = pageMetadata({ ...SITE_PAGES.mcp, standalone: true })

export default function Page() {
  return (
    <>
      <JsonLd graph={landingGraph(SITE_PAGES.mcp, MCP_PACKAGE, coreVersion())} />
      <McpLandingPage />
    </>
  )
}
