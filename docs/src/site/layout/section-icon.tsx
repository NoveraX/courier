import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  Bot,
  Box,
  Cloud,
  Code2,
  Globe,
  Layers,
  LockKeyhole,
  Monitor,
  Play,
  Puzzle,
  Rocket,
  Server,
  Settings,
  Shield,
  TestTube,
  Zap,
} from "lucide-react"

import type { SectionId } from "@/site/content/docs-nav"

/** The icon each section of the docs' navigation is drawn with, wherever the site draws it. */
export const SECTION_ICONS: Readonly<Record<SectionId, LucideIcon>> = {
  introduction: BookOpen,
  "getting-started": Rocket,
  "core-concepts": Puzzle,
  frameworks: Box,
  "react-query": Zap,
  middleware: Layers,
  validation: Shield,
  "proxy-mode": Globe,
  "server-side": Server,
  agents: Bot,
  security: LockKeyhole,
  advanced: Settings,
  testing: TestTube,
  studio: Monitor,
  deployment: Cloud,
  api: Code2,
  examples: Play,
}

interface SectionIconProps {
  id: SectionId
  className?: string | undefined
}

/**
 * A section's icon, which the screen reader passes over: the section's
 * name stands beside it.
 *
 * @param props - The section, and how the icon is drawn
 * @returns The icon
 * @example
 * ```tsx
 * <SectionIcon id={section.id} className="size-3" />
 * ```
 */
export function SectionIcon({ id, className }: SectionIconProps) {
  const Icon = SECTION_ICONS[id]
  return <Icon aria-hidden="true" className={className} />
}
