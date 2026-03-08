import type { ReactNode } from "react"

import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { Header } from "@/components/layout/header"
import { DocsPagination } from "@/components/layout/pagination"
import { Sidebar } from "@/components/layout/sidebar"
import { TableOfContents } from "@/components/layout/toc"

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex flex-1">
          <main className="min-w-0 flex-1 px-6 py-8 lg:px-8">
            <div className="mx-auto max-w-3xl">
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
