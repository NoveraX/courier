import Image from "next/image"

import { cn } from "@/lib/utils"

type Variant = "icon" | "horizontal" | "vertical" | "wordmark"

interface NexusLogoProps {
  variant?: Variant
  className?: string
  width?: number
  height?: number
  gradient?: boolean
}

const logos: Record<Variant, { dark: string; light: string; gradient: string }> = {
  icon: {
    dark: "/logos/nexus-icon-dark.png",
    light: "/logos/nexus-icon-light.png",
    gradient: "/logos/nexus-icon-gradient-2.png",
  },
  horizontal: {
    dark: "/logos/nexus-logo-horizontal-dark.png",
    light: "/logos/nexus-logo-horizontal-light.png",
    gradient: "/logos/nexus-logo-horizontal-gradient.png",
  },
  vertical: {
    dark: "/logos/nexus-logo-vertical-dark.png",
    light: "/logos/nexus-logo-vertical-light.png",
    gradient: "/logos/nexus-logo-vertical-gradient.png",
  },
  wordmark: {
    dark: "/logos/nexus-dark.png",
    light: "/logos/nexus-light.png",
    gradient: "/logos/nexus-dark.png",
  },
}

export function NexusLogo({
  variant = "icon",
  className,
  width,
  height,
  gradient = false,
}: NexusLogoProps) {
  const paths = logos[variant]
  const w = width ?? 24
  const h = height ?? 24

  if (gradient) {
    return (
      <Image
        src={paths.gradient}
        alt="Nexus"
        width={w}
        height={h}
        className={className}
        priority
      />
    )
  }

  return (
    <>
      <Image
        src={paths.light}
        alt="Nexus"
        width={w}
        height={h}
        className={cn("hidden dark:block", className)}
        priority
      />
      <Image
        src={paths.dark}
        alt="Nexus"
        width={w}
        height={h}
        className={cn("dark:hidden", className)}
        priority
      />
    </>
  )
}
