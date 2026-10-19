import type { Metadata } from "next"

import { coreVersion } from "@/site/content/version"
import { LandingPage } from "@/site/landing/landing-page"
import { JsonLd } from "@/site/seo/json-ld"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"
import { homeGraph } from "@/site/seo/structured-data/page-graphs"

export const metadata: Metadata = pageMetadata({ ...SITE_PAGES.home, standalone: true })

export default function Page() {
  return (
    <>
      <JsonLd graph={homeGraph(coreVersion())} />
      <LandingPage />
    </>
  )
}
