import type { Metadata } from "next"
import { coreVersion } from "@/site/content/version"
import { JsonLd } from "@/site/seo/json-ld"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"
import { STUDIO_PACKAGE } from "@/site/seo/structured-data/packages"
import { landingGraph } from "@/site/seo/structured-data/page-graphs"
import { StudioLandingPage } from "@/site/studio-landing/studio-landing-page"

export const metadata: Metadata = pageMetadata({ ...SITE_PAGES.studio, standalone: true })

export default function Page() {
  return (
    <>
      <JsonLd graph={landingGraph(SITE_PAGES.studio, STUDIO_PACKAGE, coreVersion())} />
      <StudioLandingPage />
    </>
  )
}
