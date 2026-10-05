"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ReactNode } from "react"

/**
 * The site's colour theme: the system's by default, or the reader's pick,
 * kept between visits and written to the root element as `data-theme`.
 *
 * @param props - The page
 * @returns The page, themed
 * @example
 * ```tsx
 * <ThemeProvider>{children}</ThemeProvider>
 * ```
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
