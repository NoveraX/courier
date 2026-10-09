"use client"

import { Dialog } from "radix-ui"

import { cn } from "@/site/cn"
import { GitHubMark } from "@/site/github-mark"
import { InstallButton } from "@/site/landing/install-button"
import { NewBadge } from "@/site/landing/new-badge"
import { PageLink } from "@/site/landing/page-link"
import { ThemeSwitch } from "@/site/layout/theme-switch"
import { type HeaderAction, type HeaderPage, menuLinksFor } from "./menu-links"

interface LandingMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The page it is on, whose own link it marks. */
  page: HeaderPage
  /** The page's call to action, beside the repository and the theme. */
  action: HeaderAction
  /** The install command it offers to copy. */
  install: string
}

/**
 * The landing pages' menu on a narrow screen: a sheet below the header with
 * every place to go — Studio and the MCP server first, the page it is on
 * marked, and from a product's page the way back to the library — then the
 * page's install command, its call to action, the repository and the
 * colour theme.
 *
 * @param props - Whether the sheet is open and what opens or closes it, the page, its call to action and install command
 * @returns The sheet
 * @example
 * ```tsx
 * <LandingMenu
 *   open={open}
 *   onOpenChange={setOpen}
 *   page="/"
 *   action={{ label: "Get started", href: "/docs/quick-start" }}
 *   install={INSTALL_COMMAND}
 * />
 * ```
 */
export function LandingMenu({ open, onOpenChange, page, action, install }: LandingMenuProps) {
  const close = () => onOpenChange(false)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-x-0 top-14 bottom-0 z-65 animate-fade bg-[rgb(4_5_6/0.5)] backdrop-blur-[6px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 top-14 z-66 max-h-[calc(100dvh-56px)] animate-drop overflow-y-auto border-b border-line bg-bg shadow-[0_30px_60px_-20px_rgb(0_0_0/0.5)]"
        >
          <div className="mx-auto max-w-[640px] px-5 pt-3.5 pb-5.5">
            <Dialog.Title className="m-0 px-0.5 pt-1 pb-2.5 font-mono text-micro font-normal tracking-[0.08em] text-fg-subtle">
              NAVIGATE
            </Dialog.Title>
            <nav aria-label="Courier" className="flex flex-col border-t border-line">
              {menuLinksFor(page).map((link, at) => (
                <PageLink
                  key={link.href}
                  href={link.href}
                  current={link.href === page}
                  onClick={close}
                  style={{ animationDelay: `${40 + at * 35}ms` }}
                  className={cn(
                    "grid min-h-15.5 animate-rise-quick grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3.5 py-2.5 text-fg hover:bg-panel hover:text-fg",
                    link.isNew
                      ? cn(
                          "my-2.5 mb-1.5 rounded-panel border-b px-3",
                          link.tone === "violet"
                            ? "border-tone-violet/30 bg-tone-violet/8"
                            : "border-brand/30 bg-brand/8",
                          link.href === page &&
                            (link.tone === "violet"
                              ? "border border-tone-violet/70"
                              : "border border-brand/70")
                        )
                      : "border-b border-line px-0.5"
                  )}
                >
                  <span
                    aria-hidden="true"
                    data-tone={link.tone}
                    className="grid size-8.5 place-items-center rounded-[9px] border border-line bg-bg-subtle text-(--tone)"
                  >
                    <link.icon className="size-3.75" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15.5px] font-medium tracking-[-0.015em]">
                      {link.label}
                    </span>
                    <span className="truncate text-small text-fg-subtle">{link.desc}</span>
                  </span>
                  {link.isNew && <NewBadge tone={link.tone === "violet" ? "violet" : "brand"} />}
                </PageLink>
              ))}
            </nav>
            <div className="mt-4.5 animate-rise-quick [animation-delay:280ms]">
              <InstallButton look="menu" command={install} />
            </div>
            <div className="mt-2.5 grid animate-rise-quick grid-cols-[minmax(0,1fr)_auto_auto] gap-2 [animation-delay:320ms]">
              <PageLink
                href={action.href}
                onClick={close}
                className="flex h-11 items-center justify-center rounded-[10px] bg-fg text-[14px] font-medium text-bg hover:text-bg hover:opacity-86"
              >
                {action.label}
              </PageLink>
              <a
                href="https://github.com/NoveraX/courier"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Courier on GitHub"
                className="grid size-11 place-items-center rounded-[10px] border border-line text-fg-muted hover:border-line-strong hover:text-fg"
              >
                <GitHubMark />
              </a>
              <ThemeSwitch size="menu" />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
