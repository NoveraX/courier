import { cn } from "@/site/cn"

const LINE =
  "absolute inset-x-0 h-[1.5px] rounded-[1px] bg-current transition-[transform,top,bottom] duration-300 ease-[cubic-bezier(.16,1,.3,1)]"

/**
 * The menu's two lines, which cross into a close mark while it is open.
 *
 * @param props - Whether the menu is open
 * @returns The mark
 * @example
 * ```tsx
 * <Burger open={open} />
 * ```
 */
export function Burger({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" className="relative block h-2.5 w-3.5">
      <span className={cn(LINE, open ? "top-[4.25px] rotate-45" : "top-[1.5px]")} />
      <span className={cn(LINE, open ? "bottom-[4.25px] -rotate-45" : "bottom-[1.5px]")} />
    </span>
  )
}
