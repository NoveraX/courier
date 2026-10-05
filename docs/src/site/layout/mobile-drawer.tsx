"use client"

import { X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dialog } from "radix-ui"

import { cn } from "@/site/cn"
import { docsNav } from "@/site/content/docs-nav"
import { ThemeSwitch } from "./theme-switch"
import { useHeadings } from "./use-headings"

interface MobileDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The docs on a narrow screen: the theme, the page's outline and every
 * section's pages, in a sheet from the left that any link closes.
 *
 * @param props - Whether the sheet is open
 * @returns The sheet
 * @example
 * ```tsx
 * <MobileDrawer open={open} onOpenChange={setOpen} />
 * ```
 */
export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const current = usePathname()
  const headings = useHeadings()
  const close = () => onOpenChange(false)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-85 bg-(--site-scrim) backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-86 w-[min(310px,84vw)] animate-site-in overflow-y-auto border-r border-line bg-bg-subtle px-4 pt-4.5 pb-10"
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="m-0 text-control font-semibold">Documentation</Dialog.Title>
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
          {headings.length > 0 && (
            <nav aria-label="On this page" className="mb-4.5 border-b border-line pb-4">
              <p className="m-0 mb-1.75 text-meta text-fg-subtle">On this page</p>
              {headings.map((heading) => (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  onClick={close}
                  className="block py-1.25 text-nav text-fg-muted"
                >
                  {heading.label}
                </a>
              ))}
            </nav>
          )}
          <nav aria-label="Documentation">
            {docsNav.map(({ label, icon: Icon, items }) => (
              <div key={label} className="mb-3.5">
                <p className="m-0 mb-1.5 flex items-center gap-2 text-label font-semibold text-fg">
                  <Icon aria-hidden="true" className="size-3.75 text-fg-muted" />
                  {label}
                </p>
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    aria-current={item.href === current ? "page" : undefined}
                    className={cn(
                      "block rounded-chip px-2.25 py-1.25 text-nav",
                      item.href === current ? "bg-panel text-fg" : "text-fg-muted"
                    )}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
