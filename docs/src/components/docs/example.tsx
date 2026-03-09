"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { CopyButton } from "./copy-button"

type ExampleProps = {
  title: string
  description: string
  code: string
  highlightedCode: string
  children: ReactNode
  learnMoreHref?: string
  learnMoreLabel?: string
  className?: string
}

export function Example({
  title,
  description,
  code,
  highlightedCode,
  children,
  learnMoreHref,
  learnMoreLabel,
  className,
}: ExampleProps) {
  return (
    <div
      data-slot="example"
      className={cn("overflow-hidden rounded-xl border border-border/60 bg-card", className)}
    >
      <div className="border-b border-border/60 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          {learnMoreHref && (
            <Link
              href={learnMoreHref}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand/80"
            >
              {learnMoreLabel || "Learn more"}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-2">
        <div className="space-y-4 p-5">{children}</div>

        <div className="relative border-t border-border/60 lg:border-t-0 lg:border-l">
          <CopyButton code={code} />
          <div
            className="shiki-wrapper overflow-x-auto [&_pre]:!rounded-none [&_pre]:!bg-transparent [&_pre]:!p-4"
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </div>
      </div>
    </div>
  )
}
