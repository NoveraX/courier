import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"

import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"
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
              <div className="flex flex-1 flex-col">
                <Header />
                <main className="flex-1 p-6">{children}</main>
              </div>
            </div>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
