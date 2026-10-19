import type { MetadataRoute } from "next"

import { sitemapEntries } from "@/site/seo/sitemap-entries"

/* Every page the site serves, by its canonical address, with the day it last changed when the
   page says. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries()
}
