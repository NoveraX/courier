import type { Metadata } from "next"

import { docsMetadata } from "@/lib/metadata"
import { pageDescriptions } from "@/site/content/page-descriptions"
import { referenceMarkdown } from "@/site/content/reference-markdown"
import { BUILDER_VERBS, ENTRY_POINTS } from "@/site/content/reference-modules"
import { searchEntries } from "@/site/content/search-index"
import { coreVersion } from "@/site/content/version"
import { referenceSections } from "@/site/reference/reference-data"
import { referenceSearchEntries } from "@/site/reference/reference-search"
import { ReferenceView } from "@/site/reference/reference-view"

export const metadata: Metadata = docsMetadata(
  "API reference",
  "Every export the docs describe: where to import it from, its signature, the fields it takes and an example."
)

export default async function ReferencePage() {
  const sections = await referenceSections()
  const described = await pageDescriptions()
  return (
    <ReferenceView
      sections={sections}
      searchable={[
        ...referenceSearchEntries(sections),
        ...searchEntries((href) => described.get(href) ?? ""),
      ]}
      entryPoints={ENTRY_POINTS}
      verbs={BUILDER_VERBS}
      version={coreVersion()}
      markdown={referenceMarkdown(sections, ENTRY_POINTS)}
    />
  )
}
