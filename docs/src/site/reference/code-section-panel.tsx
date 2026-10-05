import type { LucideIcon } from "lucide-react"

import { CodeBody } from "@/site/code/code-body"
import { CopyButton } from "@/site/code/copy-button"
import type { ShownCode } from "./reference-data"

/**
 * A code panel of the reference — SIGNATURE, EXAMPLE — under a header
 * naming what it holds, with a Copy button.
 *
 * @param props - The header's icon and label, and the highlighted code
 * @returns The panel
 * @example
 * ```tsx
 * <CodeSectionPanel icon={Brackets} label="SIGNATURE" code={section.signature} />
 * ```
 */
export function CodeSectionPanel({
  icon: Icon,
  label,
  code,
}: {
  icon: LucideIcon
  label: string
  code: ShownCode
}) {
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-panel shadow-panel">
      <div className="flex h-10 items-center gap-2 border-b border-line bg-bg-subtle pr-2 pl-3.5 font-mono text-micro tracking-[0.08em] text-fg-subtle">
        <Icon aria-hidden="true" className="size-3.25" />
        {label}
        <CopyButton text={code.code} className="ml-auto" />
      </div>
      <CodeBody html={code.html} />
    </div>
  )
}
