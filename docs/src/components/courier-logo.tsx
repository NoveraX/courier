import Image from "next/image"

import { cn } from "@/lib/utils"

type Variant = "icon" | "horizontal" | "vertical" | "wordmark"

interface CourierLogoProps {
  variant?: Variant
  className?: string
  width?: number
  height?: number
  gradient?: boolean
}

const logos: Record<Variant, { dark: string; light: string; gradient: string }> = {
  icon: {
    dark: "/logos/courier-icon-dark.png",
    light: "/logos/courier-icon-light.png",
    gradient: "/logos/courier-icon-gradient-2.png",
  },
  horizontal: {
    dark: "/logos/courier-logo-horizontal-dark.png",
    light: "/logos/courier-logo-horizontal-light.png",
    gradient: "/logos/courier-logo-horizontal-gradient.png",
  },
  vertical: {
    dark: "/logos/courier-logo-vertical-dark.png",
    light: "/logos/courier-logo-vertical-light.png",
    gradient: "/logos/courier-logo-vertical-gradient.png",
  },
  wordmark: {
    dark: "/logos/courier-dark.png",
    light: "/logos/courier-light.png",
    gradient: "/logos/courier-dark.png",
  },
}

export function CourierLogo({
  variant = "icon",
  className,
  width,
  height,
  gradient = false,
}: CourierLogoProps) {
  const paths = logos[variant]
  const w = width ?? 24
  const h = height ?? 24

  if (gradient) {
    return (
      <Image src={paths.gradient} alt="Courier" width={w} height={h} className={className} priority />
    )
  }

  return (
    <>
      <Image
        src={paths.light}
        alt="Courier"
        width={w}
        height={h}
        className={cn("hidden dark:block", className)}
        priority
      />
      <Image
        src={paths.dark}
        alt="Courier"
        width={w}
        height={h}
        className={cn("dark:hidden", className)}
        priority
      />
    </>
  )
}
