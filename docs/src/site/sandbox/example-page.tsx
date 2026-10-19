import type { ReactNode } from "react"

import type { DocMeta } from "@/site/content/doc-module"
import { findNavContext } from "@/site/content/docs-nav"
import { neighbors } from "@/site/content/neighbors"
import { DocsPager } from "@/site/layout/docs-pager"
import { DocsToc } from "@/site/layout/docs-toc"
import { PageHead } from "@/site/layout/page-head"

interface ExamplePageProps extends DocMeta {
  /** The page's address, as the navigation writes it. */
  href: string
  children: ReactNode
}

/**
 * An examples page: its head, its examples — each with code and a sandbox
 * that runs it — the pages around it, and its outline.
 *
 * @param props - The page's title, description, mode and address, and its examples
 * @returns The page
 * @example
 * ```tsx
 * <ExamplePage href="/docs/examples/basic" title="Basic Requests" description="…" mode="proxy">…</ExamplePage>
 * ```
 */
export function ExamplePage({ href, title, description, mode, children }: ExamplePageProps) {
  return (
    <>
      <main id="main-content" className="DocSearch-content min-w-0 max-w-[820px] pt-10 pb-27.5">
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
