"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { MobileNav } from "./mobile-nav"

export function Header() {
  const { setTheme, resolvedTheme } = useTheme()

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <MobileNav />
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    </header>
  )
}
