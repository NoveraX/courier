"use client"

import type { ReactNode } from "react"
import { createContext, useContext } from "react"

import { useInView } from "@/site/landing/use-in-view"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"

/** The feature demos' shared clock, and whether motion is turned down. */
export interface FeatureTime {
  tick: number
  /** When set, each demo shows its finished state and does not move. */
  still: boolean
}

const FeatureTimeContext = createContext<FeatureTime>({ tick: 0, still: false })

/**
 * The feature cards' container and the clock their demos run on: ten
 * ticks a second while the cards are on screen, none otherwise, and none
 * for a reader who asked for less motion.
 *
 * @param props - The container's classes, and the cards
 * @returns The container
 * @example
 * ```tsx
 * <FeatureClock className="grid gap-4">{cards}</FeatureClock>
 * ```
 */
export function FeatureClock({ className, children }: { className: string; children: ReactNode }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const still = useReducedMotion()
  const tick = useTicker(inView && !still, 100)
  return (
    <div ref={ref} className={className}>
      <FeatureTimeContext value={{ tick, still }}>{children}</FeatureTimeContext>
    </div>
  )
}

/**
 * The feature demos' clock, read by a demo inside {@link FeatureClock}.
 *
 * @returns The tick, and whether to stand still
 * @example
 * ```ts
 * const { tick, still } = useFeatureTime()
 * ```
 */
export function useFeatureTime(): FeatureTime {
  return useContext(FeatureTimeContext)
}
