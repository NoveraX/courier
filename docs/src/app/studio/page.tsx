import type { Metadata } from "next"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"
import { StudioLandingPage } from "@/site/studio-landing/studio-landing-page"

export const metadata: Metadata = pageMetadata({ ...SITE_PAGES.studio, standalone: true })

export default function Page() {
  return <StudioLandingPage />
}
