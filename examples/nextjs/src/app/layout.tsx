import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"

import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { Header } from "@/components/layout/header"
import { DocsPagination } from "@/components/layout/pagination"
import { Sidebar } from "@/components/layout/sidebar"
import { TableOfContents } from "@/components/layout/toc"
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
  title: "Nexus — Type-Safe HTTP for Next.js",
  description:
    "Documentation and interactive examples for @noverax/nexus, a type-safe HTTP client with request grouping, path parameters, and Next.js integration.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
        <ThemeProvider>
          <QueryProvider>
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
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
