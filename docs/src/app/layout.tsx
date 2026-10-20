import { GeistMono } from "geist/font/mono"
import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import type { ReactNode } from "react"

import { SiteAnalytics } from "@/site/analytics/site-analytics"
import { ConsentBanner } from "@/site/consent/consent-banner"
import { consentBootstrap } from "@/site/consent/consent-bootstrap"
import { ALGOLIA_SITE_VERIFICATION } from "@/site/search/docsearch-config"
import {
  DOCS_TITLE_SUFFIX,
  ORGANIZATION,
  SITE_KEYWORDS,
  SITE_LOCALE,
  SITE_NAME,
} from "@/site/seo/site-identity"
import { SITE_PAGES } from "@/site/seo/site-pages"
import { SITE_URL } from "@/site/site-url"
import { ThemeProvider } from "@/site/theme-provider"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

/* Code is set in the whole Geist Mono, from the geist package rather than Google's
   subsets: its arrows, triangles and box drawing are one cell wide like every other
   glyph, so diagrams and file trees line up. */
const geistMono = GeistMono

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_PAGES.home.title, template: `%s — ${DOCS_TITLE_SUFFIX}` },
  description: SITE_PAGES.home.description,
  applicationName: SITE_NAME,
  authors: [{ name: ORGANIZATION.name, url: ORGANIZATION.url }],
  creator: ORGANIZATION.name,
  publisher: ORGANIZATION.name,
  keywords: [...SITE_KEYWORDS],
  /* A search result may quote a page at any length and show its images at full size. */
  robots: { "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  /* A version, a port or a status code in a code sample is not a number to call. */
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: { type: "website", siteName: SITE_NAME, locale: SITE_LOCALE },
  twitter: { card: "summary_large_image" },
  verification: {
    other: { "algolia-site-verification": ALGOLIA_SITE_VERIFICATION },
  },
  other: {
    "apple-mobile-web-app-title": SITE_NAME,
  },
}

/* The browser's own chrome takes the page's background, in each colour scheme. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        {/* Decides before the first paint whether the consent bar shows: a fixed script, built
            from constants, with no reader input in it. */}
        <script dangerouslySetInnerHTML={{ __html: consentBootstrap() }} />
        <ThemeProvider>
          {/* First in the page, so a keyboard reader meets the question before the page's links. */}
          <ConsentBanner />
          {children}
          <SiteAnalytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
