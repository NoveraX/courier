import { cn } from "@/site/cn"

const TAB = "flex h-10 items-center gap-2 border-r border-line px-3.5 font-mono text-label"

/**
 * The hero editor's tabs: the definition, lit while a call draws on it,
 * and the file the calls are typed into.
 *
 * @param props - Whether the definition is lit
 * @returns The tab bar
 * @example
 * ```tsx
 * <HeroTabs lit />
 * ```
 */
export function HeroTabs({ lit }: { lit: boolean }) {
  return (
    <div className="flex items-center border-b border-line bg-bg-subtle">
      <div
        className={cn(
          TAB,
          "transition-all duration-300",
          lit ? "bg-panel text-fg" : "text-fg-subtle"
        )}
      >
        <span className="size-1.5 rounded-full bg-tone-blue" />
        api/sources.ts
      </div>
      <div className={cn(TAB, "bg-panel text-fg")}>
        <span className="size-1.5 rounded-full bg-tone-green" />
        app/users/page.tsx
      </div>
      <div className="ml-auto hidden items-center gap-2 px-3.5 font-mono text-micro text-fg-subtle min-[640px]:flex">
        <span className="size-1.5 rounded-[2px] bg-tone-teal" />
        TS · STRICT
      </div>
    </div>
  )
}
