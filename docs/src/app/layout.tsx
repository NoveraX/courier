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
    default: "Courier — Type-Safe HTTP for Next.js",
    template: "%s — Courier Docs",
  },
  description:
    "Type-safe HTTP client with request grouping, path parameters, and full Next.js integration. Proxy & direct modes, React Query, streaming, uploads.",
  metadataBase: new URL("https://courier.noverax.cloud"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Courier Docs",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Courier — Type-Safe HTTP for Next.js",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
  },
  other: {
    "apple-mobile-web-app-title": "Courier",
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
