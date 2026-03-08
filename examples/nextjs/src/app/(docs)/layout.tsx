import type { ReactNode } from "react"

import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { Header } from "@/components/layout/header"
import { DocsPagination } from "@/components/layout/pagination"
import { Sidebar } from "@/components/layout/sidebar"
import { TableOfContents } from "@/components/layout/toc"

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-16 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex flex-1">
          <main id="main-content" className="min-w-0 flex-1 px-6 py-8 lg:px-8">
            <div className="animate-page-in mx-auto max-w-3xl">
              <Breadcrumbs />
              {children}
              <DocsPagination />
            </div>
          </main>
          <TableOfContents />
        </div>
      </div>
    </div>
  )
}
