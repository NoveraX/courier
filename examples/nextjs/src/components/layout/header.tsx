"use client"

import { GitBranch, Moon, Package, Sun, X } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { MobileNav } from "./mobile-nav"

const ANNOUNCEMENT = {
  id: "nexus-v1-release",
  text: "nexus is in active development — star us on GitHub to follow updates!",
  href: "https://github.com/NoveraX/nexus",
}

const PKG_VERSION = "0.0.0"

export function Header() {
  const { setTheme, resolvedTheme } = useTheme()
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(`banner-${ANNOUNCEMENT.id}`) === "1"
  })

  const dismissBanner = () => {
    setDismissed(true)
    localStorage.setItem(`banner-${ANNOUNCEMENT.id}`, "1")
  }

  return (
    <div className="sticky top-0 z-40">
      {/* Announcement banner */}
      {!dismissed && (
        <div className="relative flex items-center justify-center gap-2 bg-brand px-8 py-1.5 text-xs font-medium text-white">
          <a
            href={ANNOUNCEMENT.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {ANNOUNCEMENT.text}
          </a>
          <button
            type="button"
            onClick={dismissBanner}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Dismiss announcement"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main header */}
      <header className="flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-sm">
        <MobileNav />

        {/* Mobile logo */}
        <Link href="/" className="flex items-center gap-2 md:hidden">
          <span className="text-base font-semibold tracking-tight">Nexus</span>
          <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
            docs
          </span>
        </Link>

        <div className="flex-1" />

        {/* Right side actions */}
        <nav className="flex items-center gap-1">
          {/* Version badge */}
          <span className="hidden rounded-md border px-2 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline-block">
            v{PKG_VERSION}
          </span>

          <Button
            variant="ghost"
            size="sm"
            className="hidden gap-1.5 text-muted-foreground sm:flex"
            asChild
          >
            <a
              href="https://www.npmjs.com/package/@noverax/nexus"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Package className="h-3.5 w-3.5" />
              <span className="text-xs">npm</span>
            </a>
          </Button>

          <Button variant="ghost" size="icon" className="text-muted-foreground" asChild>
            <a
              href="https://github.com/NoveraX/nexus"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
            >
              <GitBranch className="h-4 w-4" />
            </a>
          </Button>

          <Separator orientation="vertical" className="h-5!" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </nav>
      </header>
    </div>
  )
}
