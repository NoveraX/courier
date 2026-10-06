"use client"

import { X } from "lucide-react"
import Link from "next/link"
import { Dialog } from "radix-ui"

import { ThemeSwitch } from "@/site/layout/theme-switch"
import type { ExportFilterState } from "./export-filter"
import { ExportFilter } from "./export-filter"
import { KindMark } from "./kind-mark"
import type { ListedExport } from "./reference-sidebar"

interface ReferenceDrawerProps {
  exports: readonly ListedExport[]
  filter: ExportFilterState
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The API reference on a narrow screen: the theme, a filter over the
 * exports and every export, in a sheet from the left that a link closes —
 * and the way back to the docs.
 *
 * @param props - The exports, their filter, and whether the sheet is open
 * @returns The sheet
 * @example
 * ```tsx
 * <ReferenceDrawer exports={listed} filter={filter} open={open} onOpenChange={setOpen} />
 * ```
 */
export function ReferenceDrawer({ exports, filter, open, onOpenChange }: ReferenceDrawerProps) {
  const close = () => onOpenChange(false)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-85 bg-(--site-scrim) backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-86 w-[min(300px,84vw)] animate-site-in overflow-y-auto border-r border-line bg-bg-subtle px-4 pt-4.5 pb-10"
        >
          <div className="mb-3.5 flex items-center justify-between">
            <Dialog.Title className="m-0 text-control font-semibold">Exports</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid size-6.5 cursor-pointer place-items-center rounded-[7px] border border-line text-fg-muted"
            >
              <X aria-hidden="true" className="size-3.25" />
            </Dialog.Close>
          </div>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-line bg-panel px-3 py-2.5">
            <span className="text-control text-fg-muted">Theme</span>
            <ThemeSwitch size="drawer" />
          </div>
          <ExportFilter {...filter} />
          {exports.map(({ id, name, kind }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={close}
              className="flex items-center gap-2.25 rounded-chip px-2.25 py-1.75 font-mono text-small text-fg-muted"
            >
              <KindMark kind={kind} />
              {name}
            </a>
          ))}
          <Link
            href={"/docs/introduction"}
            onClick={close}
            className="mt-3.5 block border-t border-line pt-3.5 text-nav text-brand"
          >
            ← Back to docs
          </Link>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
