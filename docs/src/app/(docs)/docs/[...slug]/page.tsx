import fs from "node:fs"
import path from "node:path"
import { notFound } from "next/navigation"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const CONTENT_DIR = path.join(process.cwd(), "src/content/docs")

function getAllSlugs(dir: string, prefix: string[] = []): string[][] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const slugs: string[][] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      slugs.push(...getAllSlugs(path.join(dir, entry.name), [...prefix, entry.name]))
    } else if (entry.name.endsWith(".mdx")) {
      slugs.push([...prefix, entry.name.replace(/\.mdx$/, "")])
    }
  }

  return slugs
}

export function generateStaticParams() {
  if (!fs.existsSync(CONTENT_DIR)) return []
  return getAllSlugs(CONTENT_DIR).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const slugPath = slug.join("/")

  try {
    const mod = await import(`@/content/docs/${slugPath}.mdx`)
    return docsMetadata(mod.metadata.title, mod.metadata.description)
  } catch {
    return {}
  }
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const slugPath = slug.join("/")

  let Content: React.ComponentType
  let meta: { title: string; description: string; mode?: "direct" | "proxy" | "both" }

  try {
    const mod = await import(`@/content/docs/${slugPath}.mdx`)
    Content = mod.default
    meta = mod.metadata
  } catch {
    notFound()
  }

  return (
    <div className="space-y-8">
      <PageHeader title={meta.title} description={meta.description} mode={meta.mode} />
      <Prose>
        <Content />
      </Prose>
    </div>
  )
}
