import type { Metadata } from "next"

import { LandingPage } from "@/site/landing/landing-page"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"

export const metadata: Metadata = pageMetadata({ ...SITE_PAGES.home, standalone: true })

export default function Page() {
  return <LandingPage />
}
