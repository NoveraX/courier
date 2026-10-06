import { Hammer } from "lucide-react"

import { cn } from "@/site/cn"
import type { ReferenceKind } from "@/site/content/reference"
import { KIND_LOOK } from "./kind-look"

/**
 * An export's kind beside its name in a list of exports: the kind's own
 * icon in its colour — the endpoint builder's, a hammer — so the list
 * reads the way the sections below it do.
 *
 * @param props - The export's kind
 * @returns The icon
 * @example
 * ```tsx
 * <KindMark kind="FUNCTION" />
 * ```
 */
export function KindMark({ kind }: { kind: ReferenceKind | "BUILDER" }) {
  const Icon = kind === "BUILDER" ? Hammer : KIND_LOOK[kind].icon
  const tone = kind === "BUILDER" ? "text-fg-subtle" : KIND_LOOK[kind].tone
  return <Icon aria-hidden="true" className={cn("size-3 shrink-0", tone)} />
}
