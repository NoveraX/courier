import type { Metadata } from "next"

import { referenceMarkdown } from "@/site/content/reference-markdown"
import { BUILDER_VERBS, ENTRY_POINTS } from "@/site/content/reference-modules"
import { siteSearchEntries } from "@/site/content/site-search"
import { coreVersion } from "@/site/content/version"
import { referenceSections } from "@/site/reference/reference-data"
import { referenceUpdated } from "@/site/reference/reference-updated"
import { ReferenceView } from "@/site/reference/reference-view"
import { JsonLd } from "@/site/seo/json-ld"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"
import { referenceGraph } from "@/site/seo/structured-data/page-graphs"

export const metadata: Metadata = pageMetadata({ ...SITE_PAGES.reference, standalone: true })

export default async function ReferencePage() {
  const sections = await referenceSections()
  const updated = referenceUpdated(sections.map((section) => section.page))
  return (
    <>
      <JsonLd graph={referenceGraph(updated, coreVersion())} />
      <ReferenceView
        sections={sections}
        searchable={await siteSearchEntries()}
        entryPoints={ENTRY_POINTS}
        verbs={BUILDER_VERBS}
        version={coreVersion()}
        markdown={referenceMarkdown(sections, ENTRY_POINTS)}
      />
    </>
  )
}
