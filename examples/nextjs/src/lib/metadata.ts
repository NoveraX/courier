import type { Metadata } from "next"

export function docsMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: {
      title: `${title} — Nexus Docs`,
      description,
    },
  }
}
