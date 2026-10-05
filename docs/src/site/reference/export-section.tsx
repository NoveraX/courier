"use client"

import { ArrowRight, Brackets, Check, Link2, Terminal } from "lucide-react"
import Link from "next/link"

import { cn } from "@/site/cn"
import { copyText } from "@/site/copy-text"
import { InlineText } from "@/site/mdx/inline-text"
import { useFlash } from "@/site/use-flash"
import { CodeSectionPanel } from "./code-section-panel"
import { KIND_LOOK } from "./kind-look"
import { ParamRows } from "./param-rows"
import type { ReferenceSection } from "./reference-data"

function ImportButton({ from, importLine }: { from: string; importLine: string }) {
  const [copied, flash] = useFlash()
  return (
    <button
      type="button"
      title={`Copy ${importLine}`}
      onClick={async () => flash(await copyText(importLine))}
      className="mt-3 inline-flex h-7 max-w-full cursor-pointer items-center gap-2 rounded-[7px] border border-line bg-panel px-2.5 font-mono text-meta text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      <span className="text-code-keyword">from</span>
      <span className="truncate text-code-string">&quot;{from}&quot;</span>
      {copied && <Check aria-label="Copied" className="size-3 text-ok" />}
    </button>
  )
}

/**
 * One export in the API reference: its kind and name with a link to it,
 * the module to import it from (a click copies the import its page writes), what it does,
 * its signature, the fields it takes, an example, and the docs page all
 * of it comes from.
 *
 * @param props - The export
 * @returns The section
 * @example
 * ```tsx
 * <ExportSection section={section} />
 * ```
 */
export function ExportSection({ section }: { section: ReferenceSection }) {
  const look = KIND_LOOK[section.kind]
  const Icon = look.icon
  return (
    <section id={section.id} className="mt-7 scroll-mt-[70px] border-t border-line pt-11">
      <div className={cn("flex flex-wrap items-center gap-2.5", look.tone)}>
        <span className="grid size-7.5 shrink-0 place-items-center rounded-control border border-current/26 bg-current/11">
          <Icon aria-hidden="true" className="size-3.75" />
        </span>
        <h2 className="m-0 font-mono text-[21px] font-medium tracking-[-0.02em] text-fg">
          {section.name}
        </h2>
        <span className="rounded-chip bg-current/11 px-2 py-0.75 font-mono text-micro tracking-[0.06em]">
          {section.kind}
        </span>
        <a
          href={`#${section.id}`}
          aria-label={`Link to ${section.name}`}
          className="flex text-fg-subtle hover:text-fg"
        >
          <Link2 aria-hidden="true" className="size-3.5" />
        </a>
      </div>
      {section.importLine && <ImportButton from={section.from} importLine={section.importLine} />}
      <p className="m-0 mt-3.5 max-w-[66ch] text-body text-fg-muted">
        <InlineText text={section.desc} />
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {section.signature && (
          <CodeSectionPanel icon={Brackets} label="SIGNATURE" code={section.signature} />
        )}
        {section.params.length > 0 && <ParamRows params={section.params} />}
        {section.example && (
          <CodeSectionPanel icon={Terminal} label="EXAMPLE" code={section.example} />
        )}
      </div>
      <Link
        href={section.page}
        className="mt-4 inline-flex items-center gap-1.5 text-control text-brand hover:underline"
      >
        The full page
        <ArrowRight aria-hidden="true" className="size-3" />
      </Link>
    </section>
  )
}
