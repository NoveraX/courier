import type { Metadata } from "next"

import { docsMetadata } from "@/lib/metadata"
import { referenceMarkdown } from "@/site/content/reference-markdown"
import { BUILDER_VERBS, ENTRY_POINTS } from "@/site/content/reference-modules"
import { siteSearchEntries } from "@/site/content/site-search"
import { coreVersion } from "@/site/content/version"
import { referenceSections } from "@/site/reference/reference-data"
import { ReferenceView } from "@/site/reference/reference-view"

export const metadata: Metadata = docsMetadata(
  "API reference",
  "Every export the docs describe: where to import it from, its signature, the fields it takes and an example."
)

export default async function ReferencePage() {
  const sections = await referenceSections()
  return (
    <ReferenceView
      sections={sections}
      searchable={await siteSearchEntries()}
      entryPoints={ENTRY_POINTS}
      verbs={BUILDER_VERBS}
      version={coreVersion()}
      markdown={referenceMarkdown(sections, ENTRY_POINTS)}
    />
  )
}
