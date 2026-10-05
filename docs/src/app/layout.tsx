import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"

import { QueryProvider } from "@/site/query-provider"
import { ThemeProvider } from "@/site/theme-provider"

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
    default: "@noverax/courier — type-safe HTTP for any framework, any REST backend",
    template: "%s — Courier Docs",
  },
  description:
    "Define your API once in plain TypeScript. Get end-to-end inference, one proxy route for every endpoint, React Query bindings and middleware — against any REST backend, which needs zero changes.",
  metadataBase: new URL("https://courier.noverax.cloud"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Courier",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Courier — type-safe HTTP for any framework",
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
