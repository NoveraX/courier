import type { Metadata } from "next"

import { McpLandingPage } from "@/site/mcp-landing/mcp-landing-page"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"

export const metadata: Metadata = pageMetadata({ ...SITE_PAGES.mcp, standalone: true })

export default function Page() {
  return <McpLandingPage />
}
