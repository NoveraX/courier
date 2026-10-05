import type { ReactNode } from "react"

import { siteSearchEntries } from "@/site/content/site-search"
import { coreVersion } from "@/site/content/version"
import { DocsChrome } from "@/site/layout/docs-chrome"
import { DocsSidebar } from "@/site/layout/docs-sidebar"
import { SiteFooter } from "@/site/site-footer"

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const entries = await siteSearchEntries()
  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main-content"
        className="sr-only z-95 rounded-control bg-brand px-4 py-2 text-control text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-4"
      >
        Skip to content
      </a>
      <DocsChrome part="docs" entries={entries} />
      <div className="mx-auto grid max-w-[1520px] grid-cols-1 gap-10 px-6 min-[1000px]:grid-cols-[252px_minmax(0,1fr)] min-[1240px]:grid-cols-[252px_minmax(0,1fr)_200px]">
        <DocsSidebar version={coreVersion()} />
        {children}
      </div>
      <SiteFooter />
    </div>
  )
}
