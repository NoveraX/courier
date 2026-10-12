import { cn } from "@/site/cn"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { NEW_LINES, OLD_LINES, REFACTOR_TABS } from "./refactor-code"
import type { RefactorFrame } from "./refactor-frame"
import { codeFontSize } from "./refactor-layout"
import { RefactorLine } from "./refactor-line"
import { codeScroll } from "./refactor-scroll"
import { RefactorTabs } from "./refactor-tabs"

interface RefactorEditorProps {
  frame: RefactorFrame
  lineHeight: number
  /** The hand-written lines, then the new ones, highlighted. */
  lines: readonly CodeToken[][]
  /** The window onto the lines when they do not all fit, in px; none when they do. */
  window?: number | undefined
}

const LINE_KEYS = Array.from(
  { length: OLD_LINES.length + NEW_LINES.length },
  (_, at) => `line-${at}`
)

function status(frame: RefactorFrame): { text: string; tone: string } {
  if (frame.done) return { text: "✓ same behaviour · typed end to end · 1 file", tone: "text-ok" }
  if (frame.struck)
    return { text: "✕ deleting hand-written transport code…", tone: "text-tone-red" }
  return { text: "⚠ 3 files, 1 type assertion, 0 compile-time guarantees", tone: "text-tone-amber" }
}

/**
 * The refactor's editor: the hand-written code struck and removed line by
 * line, then the typed lines added — with its files as tabs that close as
 * they empty, and a status line saying where it stands, two lines tall on
 * a phone so that it shows whole. Where not every line fits, it shows them
 * through a window that follows the line changed last.
 *
 * @param props - The frame, the line height, the highlighted lines and the window onto them
 * @returns The editor
 * @example
 * ```tsx
 * <RefactorEditor frame={frame} lineHeight={23} lines={lines} />
 * ```
 */
export function RefactorEditor({ frame, lineHeight, lines, window }: RefactorEditorProps) {
  const { text, tone } = status(frame)
  const scroll = window === undefined ? 0 : codeScroll(frame.lines, lineHeight, window)
  const diff = frame.done
    ? { label: `−${OLD_LINES.length} +${NEW_LINES.length}`, tone: "text-ok" }
    : frame.struck
      ? { label: `−${frame.struck}`, tone: "text-tone-red" }
      : { label: `${REFACTOR_TABS.length} files`, tone: "text-fg-subtle" }
  return (
    <div
      className={cn(
        "min-w-0 rounded-[15px] p-px transition-shadow duration-600 motion-reduce:transition-none",
        frame.done
          ? "bg-[linear-gradient(180deg,rgb(125_185_255/0.55),rgb(94_211_163/0.3)_45%,rgb(255_255_255/0.05))] shadow-[0_50px_110px_-50px_rgb(94_211_163/0.5)]"
          : "bg-[linear-gradient(180deg,rgb(240_128_106/0.4),rgb(255_255_255/0.05)_45%)] shadow-[0_50px_110px_-50px_rgb(240_128_106/0.3)]"
      )}
    >
      <div className="overflow-hidden rounded-[14px] bg-panel">
        <RefactorTabs frame={frame} diff={diff} />
        <div
          className={cn(
            "dots relative overflow-x-auto py-3",
            window !== undefined && "overflow-y-hidden"
          )}
          style={window === undefined ? undefined : { height: `${window + 24}px` }}
        >
          <div
            className="min-w-max font-mono text-fg-muted transition-transform duration-450 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none"
            style={{
              fontSize: `${codeFontSize(lineHeight)}px`,
              transform: scroll ? `translateY(-${scroll}px)` : undefined,
            }}
          >
            {lines.map((line, at) => (
              <RefactorLine
                key={LINE_KEYS[at]}
                at={at}
                state={frame.lines[at] ?? "hidden"}
                lineHeight={lineHeight}
                tokens={line}
              />
            ))}
          </div>
        </div>
        <div className="flex h-8.5 items-center gap-2.5 overflow-hidden border-t border-line bg-bg-subtle px-4 font-mono text-micro tracking-normal whitespace-nowrap max-[420px]:h-11 max-[420px]:leading-[1.45] max-[420px]:whitespace-normal">
          <span
            className={cn("transition-colors duration-350 motion-reduce:transition-none", tone)}
          >
            {text}
          </span>
        </div>
      </div>
    </div>
  )
}
