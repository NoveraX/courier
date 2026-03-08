import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"

import { QueryProvider } from "@/components/query-provider"
import { ThemeProvider } from "@/components/theme-provider"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Nexus — Type-Safe HTTP for Next.js",
    template: "%s — Nexus Docs",
  },
  description:
    "Type-safe HTTP client with request grouping, path parameters, and full Next.js integration. Proxy & direct modes, React Query, streaming, uploads.",
  metadataBase: new URL("https://nexus.noverax.dev"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Nexus Docs",
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
