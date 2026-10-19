import type { ReactNode } from "react"

import { findNavContext } from "@/site/content/docs-nav"
import { neighbors } from "@/site/content/neighbors"
import { coreVersion } from "@/site/content/version"
import { DocsPager } from "@/site/layout/docs-pager"
import { DocsToc } from "@/site/layout/docs-toc"
import { PageHead } from "@/site/layout/page-head"
import { JsonLd } from "@/site/seo/json-ld"
import { docsGraph } from "@/site/seo/structured-data/page-graphs"
import { EXAMPLE_PAGES, type ExampleName } from "./example-pages"

interface ExamplePageProps {
  /** The page, by the last segment of its address. */
  name: ExampleName
  children: ReactNode
}

/**
 * An examples page: its head — its title, description and mode, as the
 * examples' list gives them — its examples, each with code and a sandbox
 * that runs it, the pages around it, and its outline.
 *
 * @param props - The page's name, and its examples
 * @returns The page
 * @example
 * ```tsx
 * <ExamplePage name="basic">…</ExamplePage>
 * ```
 */
export function ExamplePage({ name, children }: ExamplePageProps) {
  const { title, description, mode } = EXAMPLE_PAGES[name]
  const href = `/docs/examples/${name}`
  return (
    <>
      <JsonLd graph={docsGraph({ path: href, title, description }, coreVersion())} />
      <main id="main-content" className="min-w-0 max-w-[820px] pt-10 pb-27.5">
        <PageHead meta={{ title, description, mode }} section={findNavContext(href)?.section} />
        <article
          data-article=""
          className="flex flex-col gap-4 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.87em] [&_:not(pre)>code]:text-brand"
        >
          {children}
        </article>
        <DocsPager {...neighbors(href)} />
      </main>
      <DocsToc title={title} />
    </>
  )
}
