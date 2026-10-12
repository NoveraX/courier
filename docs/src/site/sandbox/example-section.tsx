import { ArrowRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { CodePanel } from "@/site/code/code-panel"
import { Heading } from "@/site/mdx/heading"

interface ExampleSectionProps {
  title: string
  description: string
  /** The code the example runs, as a reader would write it. */
  code: string
  language?: string | undefined
  /** The page that explains what the example shows. */
  learnMore?: { href: string; label: string } | undefined
  /** The sandbox that runs it. */
  children: ReactNode
}

function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * One example of an examples page: what it shows, the code, the sandbox
 * that runs that code against the docs' own backend, and the page that
 * explains it.
 *
 * @param props - The example's title, description, code and explaining page, and its sandbox
 * @returns The section
 * @example
 * ```tsx
 * <ExampleSection title="GET — fetch users" description="…" code={code}><GetDemo /></ExampleSection>
 * ```
 */
export function ExampleSection({
  title,
  description,
  code,
  language = "ts",
  learnMore,
  children,
}: ExampleSectionProps) {
  return (
    <section>
      <Heading level={2} id={slugOf(title)}>
        {title}
      </Heading>
      <p className="my-3.5 text-body text-fg-muted">{description}</p>
      <div className="flex flex-col gap-3.5">
        <CodePanel code={code} language={language} />
        {children}
      </div>
      {learnMore && (
        <Link
          href={learnMore.href}
          className="mt-2.5 -mb-1 inline-flex items-center gap-1.5 py-1 text-control text-brand hover:underline"
        >
          {learnMore.label}
          <ArrowRight aria-hidden="true" className="size-3" />
        </Link>
      )}
    </section>
  )
}
