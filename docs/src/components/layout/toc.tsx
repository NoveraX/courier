"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type TocItem = {
  id: string
  text: string
  level: number
}

export function TableOfContents() {
  const pathname = usePathname()
  const [headings, setHeadings] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState("")

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scan headings on route change
  useEffect(() => {
    const content = document.querySelector("main")
    if (!content) return

    const elements = content.querySelectorAll("h2[id], h3[id]")
    const items: TocItem[] = Array.from(elements).map((el) => ({
      id: el.id,
      text: Array.from(el.childNodes)
        .filter((n) => !(n instanceof HTMLElement && n.hasAttribute("aria-hidden")))
        .map((n) => n.textContent)
        .join("")
        .trim(),
      level: el.tagName === "H2" ? 2 : 3,
    }))

    setHeadings(items)
    setActiveId("")
  }, [pathname])

  useEffect(() => {
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: "-80px 0px -80% 0px", threshold: 0 }
    )

    for (const heading of headings) {
      const el = document.getElementById(heading.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [headings])

  if (headings.length === 0) return null

  return (
    <aside aria-label="Table of contents" className="hidden w-56 shrink-0 xl:block">
      <div className="sticky top-20 py-8 pr-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <nav aria-label="Page sections" className="space-y-1">
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              onClick={(e) => {
                e.preventDefault()
                const el = document.getElementById(heading.id)
                if (el) {
                  window.history.pushState(null, "", `#${heading.id}`)
                  el.scrollIntoView({ behavior: "smooth" })
                }
              }}
              className={cn(
                "block py-1 text-sm transition-colors",
                heading.level === 3 && "pl-3",
                activeId === heading.id
                  ? "font-medium text-brand"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  )
}
