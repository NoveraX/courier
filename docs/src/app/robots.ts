import type { MetadataRoute } from "next"

import { SITE_URL } from "@/site/site-url"

/* Every page may be crawled; the routes the pages call are not pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
