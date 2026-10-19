import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadDoc } from "@/site/content/doc-module"
import { docTitles } from "@/site/content/doc-titles"
import { docSlugs, docSource } from "@/site/content/docs-files"
import { findNavContext } from "@/site/content/docs-nav"
import { neighbors } from "@/site/content/neighbors"
import { pageMarkdown } from "@/site/content/page-markdown"
import { readingMinutes } from "@/site/content/reading-time"
import { DocsPager } from "@/site/layout/docs-pager"
import { DocsToc } from "@/site/layout/docs-toc"
import { PageHead } from "@/site/layout/page-head"
import { SITE_COMPONENTS } from "@/site/mdx/site-components"
import { pageMetadata } from "@/site/seo/page-metadata"

interface PageProps {
  params: Promise<{ slug: string[] }>
}

export function generateStaticParams(): { slug: string[] }[] {
  return docSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  if (!docSource(slug)) return {}
  const { meta } = await loadDoc(slug)
  const path = `/docs/${slug.join("/")}`
  return pageMetadata({
    path,
    title: docTitles().get(path) ?? meta.title,
    description: meta.description,
    section: findNavContext(path)?.section.label,
    updated: meta.updated,
  })
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params
  const source = docSource(slug)
  if (!source) notFound()
  const { Content, meta } = await loadDoc(slug)
  const href = `/docs/${slug.join("/")}`
  const markdown = pageMarkdown(source, meta.title, meta.description)
  return (
    <>
      <main id="main-content" className="min-w-0 max-w-[820px] pt-10 pb-27.5">
        <PageHead
          meta={meta}
          section={findNavContext(href)?.section}
          minutes={readingMinutes(markdown)}
          page={{ fileName: `${slug.at(-1) ?? "page"}.md`, markdown }}
        />
        <article
          data-article=""
          className="[&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.87em] [&_:not(pre)>code]:text-brand"
        >
          <Content components={SITE_COMPONENTS} />
        </article>
        <DocsPager {...neighbors(href)} />
      </main>
      <DocsToc title={meta.title} markdown={markdown} />
    </>
  )
}
