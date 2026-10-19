import type { Metadata } from "next"

import { DocsChrome } from "@/site/layout/docs-chrome"
import { NotFoundContent } from "@/site/layout/not-found-content"
import { SiteFooter } from "@/site/site-footer"

/* An address with no page anywhere on the site: the docs' header and search, and the footer. */
export const metadata: Metadata = { title: "Page not found" }

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <a
        href="#main-content"
        className="sr-only z-95 rounded-control bg-brand px-4 py-2 text-control text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-4"
      >
        Skip to content
      </a>
      <DocsChrome part="docs" />
      {/* The page is shorter than a window: its content takes the height the
          header and the footer leave, so the footer stays at the window's foot. */}
      <div className="mx-auto w-full max-w-[820px] flex-1 px-6">
        <NotFoundContent />
      </div>
      <SiteFooter />
    </div>
  )
}
