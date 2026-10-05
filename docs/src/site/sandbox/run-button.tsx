"use client"

import { Loader2 } from "lucide-react"
import type { ComponentPropsWithoutRef } from "react"

import { cn } from "@/site/cn"

interface RunButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  loading?: boolean | undefined
  label?: string | undefined
  /** A sandbox's main call, or one of the others it offers. */
  variant?: "primary" | "secondary" | undefined
}

const VARIANT = {
  primary: "bg-fg text-bg hover:opacity-86",
  secondary: "border border-line bg-bg-subtle text-fg hover:border-line-strong",
} as const

/**
 * A button that sends a sandbox's call, spinning while it is in flight —
 * the main call in the text colour, the others quieter.
 *
 * @param props - Whether a call is in flight, the label, the kind of call, and the button's own props
 * @returns The button
 * @example
 * ```tsx
 * <RunButton loading={isPending} label="Create user" onClick={create} />
 * ```
 */
export function RunButton({
  loading = false,
  label = "Run request",
  variant = "primary",
  className,
  disabled,
  ...props
}: RunButtonProps) {
  return (
    <button
      type="button"
      disabled={loading || disabled}
      className={cn(
        "flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-control text-[13.5px] font-medium transition-[opacity,border-color] disabled:cursor-default disabled:opacity-60",
        VARIANT[variant],
        className
      )}
      {...props}
    >
      {loading && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
      {label}
    </button>
  )
}
