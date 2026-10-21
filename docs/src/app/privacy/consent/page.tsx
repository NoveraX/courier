import type { Metadata } from "next"

import Consent from "@/content/legal/consent.mdx"
import { LegalDocument } from "@/site/legal/legal-document"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"

export const metadata: Metadata = pageMetadata({ ...SITE_PAGES.consent, standalone: true })

export default function Page() {
  return <LegalDocument name="consent" Content={Consent} />
}
