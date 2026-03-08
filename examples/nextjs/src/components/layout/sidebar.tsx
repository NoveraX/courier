"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { navCategories } from "./nav-items"

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar-background">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-lg">Nexus</span>
          <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
            examples
          </span>
        </Link>
      </div>
      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-6">
          {navCategories.map((category) => (
            <div key={category.label}>
              <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {category.label}
              </h4>
              <div className="space-y-0.5">
                {category.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      pathname === item.href
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground"
                    )}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}
