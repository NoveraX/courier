import { REFUSED_AT } from "./hero-code"

const CREATE_LINE = 7

/**
 * The type checker refusing the create: a wavy line under the argument and
 * the message an editor shows for it, word for word.
 *
 * @returns The underline and the message
 * @example
 * ```tsx
 * <RefusedCall />
 * ```
 */
export function RefusedCall() {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-5.75 leading-5.75 whitespace-pre text-transparent underline decoration-tone-red decoration-wavy decoration-[1.5px] underline-offset-5"
        style={{ top: `${CREATE_LINE * 23}px`, left: `calc(18px + ${REFUSED_AT}ch)` }}
      >
        {'{ name: "Ada" }'}
      </span>
      <div
        role="status"
        className="absolute z-3 max-w-[340px] animate-[landing-rise_0.2s_ease_both] overflow-hidden rounded-[9px] border border-tone-red/40 bg-raised shadow-overlay"
        style={{ top: `${CREATE_LINE * 23 + 29}px`, left: "calc(18px + 20ch)" }}
      >
        <div className="flex items-center gap-1.75 border-b border-line px-2.75 py-1.75 text-micro text-tone-red">
          ✕ ts(2345)
        </div>
        <p className="m-0 px-2.75 py-2.25 text-[11.4px] leading-[1.6] whitespace-normal text-fg-muted">
          Property <span className="text-tone-green">'email'</span> is missing in type{" "}
          <span className="text-tone-teal">'{"{ name: string; }"}'</span> but required in type{" "}
          <span className="text-tone-teal">'{"{ name: string; email: string; }"}'</span>.
        </p>
      </div>
    </>
  )
}
