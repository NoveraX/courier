"use client"

import { useState } from "react"

import { BrandIcon } from "@/site/landing/brand-icon"
import { isPale } from "@/site/landing/brands"
import { STUDIO_FRAMEWORKS } from "./studio-frameworks"

/**
 * The frameworks Studio connects to, as tiles: pointing at one shows its
 * mark in colour and names the entry it imports.
 *
 * @returns The section
 * @example
 * ```tsx
 * <FrameworkGrid />
 * ```
 */
export function FrameworkGrid() {
  const [hovered, setHovered] = useState<number | null>(null)
  const entry = STUDIO_FRAMEWORKS[hovered ?? 0]?.entry ?? "react"
  return (
    <section aria-label="Frameworks" className="pt-[clamp(58px,10vw,96px)]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5.5 px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="m-0 font-mono text-[11px] tracking-[0.1em] text-fg-subtle">
              ONE PLUGIN FOR EVERY STACK
            </p>
            <h2 className="m-0 text-[clamp(20px,2.2vw,26px)] font-semibold tracking-[-0.03em]">
              Nine frameworks, one line to connect
            </h2>
          </div>
          <span className="font-mono text-label text-fg-subtle">
            @noverax/courier-studio/<span className="text-brand">{entry}</span>
          </span>
        </div>
        <ul className="m-0 grid list-none grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line p-0 min-[1100px]:grid-cols-9">
          {STUDIO_FRAMEWORKS.map((framework, at) => {
            const on = at === hovered
            const colour = on && !isPale(framework.hex) ? framework.hex : undefined
            return (
              <li
                key={framework.name}
                onPointerEnter={() => setHovered(at)}
                className="flex min-h-32 flex-col items-center justify-center gap-3 bg-panel px-2.5 py-4.5 transition-colors duration-200 hover:bg-panel-subtle"
              >
                <span
                  className="text-fg transition-opacity duration-200"
                  style={{ color: colour, opacity: on ? 1 : 0.78 }}
                >
                  <BrandIcon path={framework.path} className="block size-7.5" />
                </span>
                <span className="flex flex-col items-center gap-0.75">
                  <span className="text-nav font-semibold">{framework.name}</span>
                  <span className="font-mono text-micro text-fg-subtle">{framework.hook}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
