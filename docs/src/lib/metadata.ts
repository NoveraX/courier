import type { Metadata } from "next"

export function docsMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: {
      title: `${title} — Courier Docs`,
      description,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Courier — Type-Safe HTTP for Next.js",
        },
      ],
    },
  }
}
