"use client"

import { SquarePen } from "lucide-react"
import { usePathname } from "next/navigation"

const EDIT_BASE = "https://github.com/NoveraX/nexus/edit/master/docs"

export function EditPageLink() {
  const pathname = usePathname()

  let filePath: string
  if (pathname.startsWith("/docs/examples/")) {
    filePath = `src/app/(docs)${pathname}/page.tsx`
  } else {
    const slug = pathname.replace(/^\/docs\//, "")
    filePath = `src/content/docs/${slug}.mdx`
  }

  return (
    <a
      href={`${EDIT_BASE}/${filePath}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-12 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <SquarePen className="h-4 w-4" />
      Edit this page on GitHub
    </a>
  )
}
