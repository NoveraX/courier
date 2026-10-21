import type { MDXProps } from "mdx/types"
import type { JSX } from "react"

import { type LegalPage, legalUpdated } from "@/site/content/legal-files"
import { DocsChrome } from "@/site/layout/docs-chrome"
import { PageHead } from "@/site/layout/page-head"
import { SITE_COMPONENTS } from "@/site/mdx/site-components"
import { JsonLd } from "@/site/seo/json-ld"
import { SITE_PAGES } from "@/site/seo/site-pages"
import { legalGraph } from "@/site/seo/structured-data/page-graphs"
import { SiteFooter } from "@/site/site-footer"

interface LegalDocumentProps {
  /** Which legal page it is. */
  name: LegalPage
  /** The page's text, written as MDX under `src/content/legal`. */
  Content: (props: MDXProps) => JSX.Element
}

/**
 * A legal page — the privacy notice, the consent to analytics: the docs'
 * header and search, the page's title, what it covers and when its text
 * last changed, the text set as a docs page's is, and the footer. It
 * belongs to neither the docs nor the API, so the header lights neither.
 *
 * @param props - Which page, and its text
 * @returns The page
 * @example
 * ```tsx
 * <LegalDocument name="privacy" Content={Notice} />
 * ```
 */
export function LegalDocument({ name, Content }: LegalDocumentProps) {
  const page = SITE_PAGES[name]
  const updated = legalUpdated(name)
  return (
    <div className="flex min-h-[calc(100vh-var(--consent-bar-shown,0px))] flex-col bg-bg">
      <JsonLd graph={legalGraph(page, updated)} />
      <a
        href="#main-content"
        className="sr-only z-95 rounded-control bg-brand px-4 py-2 text-control text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-4"
      >
        Skip to content
      </a>
      <DocsChrome />
      <main id="main-content" className="mx-auto w-full max-w-[820px] flex-1 px-6 pt-10 pb-27.5">
        <PageHead
          meta={{ title: page.card.headline, description: page.description, updated }}
          section={undefined}
        />
        <article className="[&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.87em] [&_:not(pre)>code]:text-brand">
          <Content components={SITE_COMPONENTS} />
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
