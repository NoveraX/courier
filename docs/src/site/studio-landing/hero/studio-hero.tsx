import { ArrowUpRight, ShieldCheck } from "lucide-react"

import { InstallButton } from "@/site/landing/install-button"
import { START_COMMAND } from "@/site/landing/start-command"
import { STUDIO_DEMO_URL } from "@/site/site-url"
import { StudioWindow } from "./studio-window"

/** The command that sets Studio up: Courier's one command, which adds Studio with its plugin, a mock and the scripts. */
export const STUDIO_INSTALL = START_COMMAND

/**
 * The top of Studio's page: what Studio is in one line, the live demo to
 * try it in, the one command that sets it up, and Studio itself, streaming calls.
 *
 * @returns The section
 * @example
 * ```tsx
 * <StudioHero />
 * ```
 */
export function StudioHero() {
  return (
    <section className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-55 left-1/2 h-175 w-[1200px] max-w-[160vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,var(--studio-glow),transparent_62%)]"
      />
      <div className="relative mx-auto max-w-[1200px] px-5 pt-[clamp(48px,9vw,80px)] text-center">
        <div className="inline-flex h-7 animate-rise items-center gap-2.25 rounded-full border border-line bg-panel px-3 text-small text-fg-muted">
          <ShieldCheck aria-hidden="true" className="size-3.25 text-ok" />
          Dev-only · runs locally · off in production builds
        </div>
        <h1 className="mx-auto mt-6 mb-0 max-w-[16ch] animate-rise text-[clamp(40px,6vw,76px)] leading-[1.01] font-semibold tracking-[-0.045em]">
          See every request your app <span className="text-brand">makes</span>
        </h1>
        <p className="mx-auto mt-5.5 mb-0 max-w-[58ch] animate-rise text-[clamp(15.5px,1.5vw,18.5px)] leading-[1.58] text-fg-muted">
          Courier Studio is a visual debugger for your API layer. Inspect live traffic, replay
          calls, mock backends, inject failures and audit quality — from one tab next to your dev
          server.
        </p>
        <div className="mt-8 flex animate-rise flex-wrap justify-center gap-2.5">
          <a
            href={STUDIO_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center gap-2 rounded-[10px] bg-fg px-5 text-[14.5px] font-medium text-bg hover:text-bg hover:opacity-86"
          >
            Try the live demo
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
          <InstallButton look="studio" command={STUDIO_INSTALL} />
        </div>
      </div>
      <div className="relative mx-auto mt-14 max-w-[1140px] px-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-17.5 left-1/2 h-60 w-4/5 -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,var(--studio-glow),transparent_70%)] blur-[24px]"
        />
        <div className="relative animate-rise rounded-2xl bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-brand)_45%,transparent),var(--color-line)_38%,transparent)] p-px shadow-(--studio-shadow)">
          <StudioWindow />
        </div>
      </div>
    </section>
  )
}
