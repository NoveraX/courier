import { cn } from "@/site/cn"
import { COMPLETIONS } from "./hero-code"

/**
 * The editor's completion list on `caller.users.`: every endpoint of the
 * group with the type the definition gives it, one picked — moved left as
 * far as it must be to show whole in the editor's width, on a phone too.
 *
 * @param props - Where it opens, in lines and characters, and the entry picked
 * @returns The list
 * @example
 * ```tsx
 * <CompletionPopup line={2} column={32} picked={1} />
 * ```
 */
export function CompletionPopup({
  line,
  column,
  picked,
}: {
  line: number
  column: number
  picked: number
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute z-3 w-(--width) min-w-[260px] animate-[landing-rise_0.16s_ease_both] overflow-hidden rounded-[9px] border border-line-strong bg-raised shadow-overlay [--width:min(360px,calc(100cqw-24px))]"
      style={{
        top: `${line * 23}px`,
        left: `min(calc(18px + ${column}ch), calc(100cqw - var(--width) - 12px))`,
      }}
    >
      {COMPLETIONS.map(({ name, sig }, at) => (
        <div
          key={name}
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-1.5 text-[11.8px]",
            at === picked && "bg-brand/14"
          )}
        >
          <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-tone-violet/16 text-[10px] text-tone-violet">
            ƒ
          </span>
          <span className="text-fg">{name}</span>
          <span
            className={cn(
              "ml-auto min-w-0 truncate",
              at === picked ? "text-fg-muted" : "text-fg-subtle"
            )}
          >
            {sig}
          </span>
        </div>
      ))}
    </div>
  )
}
