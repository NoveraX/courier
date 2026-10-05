import type { MetadataRoute } from "next"

import { flatNavItems } from "@/site/content/docs-nav"
import { SITE_URL as BASE_URL } from "@/site/site-url"

export default function sitemap(): MetadataRoute.Sitemap {
  const navItems = flatNavItems()

  const docs: MetadataRoute.Sitemap = navItems.map((item) => ({
    url: `${BASE_URL}${item.href}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...docs,
  ]
}
