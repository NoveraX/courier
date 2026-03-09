"use client"

import { ChevronRight, Menu, Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"

import { NexusLogo } from "@/components/nexus-logo"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { docsNav, type NavItem, type NavSection } from "./nav-items"

function MobileLink({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItem
  isActive: boolean
  onNavigate: () => void
}) {
  if (item.disabled) {
    return (
      <span className="flex items-center rounded-r-md border-l-2 border-transparent py-1.5 pl-3 text-sm text-muted-foreground/40">
        {item.title}
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center rounded-r-md border-l-2 py-1.5 pl-3 text-sm transition-colors",
        isActive
          ? "border-brand bg-brand/10 font-medium text-brand"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground"
      )}
    >
      {item.title}
    </Link>
  )
}

function MobileSection({
  section,
  pathname,
  onNavigate,
  searchQuery,
}: {
  section: NavSection
  pathname: string
  onNavigate: () => void
  searchQuery: string
}) {
  const hasActiveItem = section.items.some((item) => item.href === pathname)
  const [open, setOpen] = useState(section.defaultOpen ?? hasActiveItem)

  const filteredItems = useMemo(() => {
    if (!searchQuery) return section.items
    return section.items.filter((item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [section.items, searchQuery])

  if (searchQuery && filteredItems.length === 0) return null

  const Icon = section.icon
  const isOpen = searchQuery ? true : open

  return (
    <div>
      <button
        type="button"
        onClick={() => !searchQuery && setOpen(!open)}
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
          "text-foreground/70 hover:bg-accent hover:text-accent-foreground",
          hasActiveItem && "text-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 text-left">{section.label}</span>
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
          aria-hidden="true"
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-0.5 ml-5 space-y-px">
            {filteredItems.map((item) => (
              <MobileLink
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-left">
            <NexusLogo variant="horizontal" width={82} height={22} />
            <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
              docs
            </span>
          </SheetTitle>
        </SheetHeader>
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="search"
              aria-label="Search documentation"
              placeholder="Search docs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "w-full rounded-md border border-border/50 bg-background/50 py-1.5 pl-8 pr-3 text-sm",
                "placeholder:text-muted-foreground/50",
                "focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/20",
                "transition-colors"
              )}
            />
          </div>
        </div>
        <ScrollArea className="h-[calc(100vh-7.5rem)] py-3">
          <nav className="space-y-1 px-3">
            {docsNav.map((section) => (
              <MobileSection
                key={section.label}
                section={section}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
                searchQuery={search}
              />
            ))}
            {search &&
              !docsNav.some((s) =>
                s.items.some((i) => i.title.toLowerCase().includes(search.toLowerCase()))
              ) && (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground/60">
                  No results found
                </p>
              )}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
