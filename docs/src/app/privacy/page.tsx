import type { Metadata } from "next"

import Notice from "@/content/legal/privacy.mdx"
import { LegalDocument } from "@/site/legal/legal-document"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"

export const metadata: Metadata = pageMetadata({ ...SITE_PAGES.privacy, standalone: true })

export default function Page() {
  return <LegalDocument name="privacy" Content={Notice} />
}
