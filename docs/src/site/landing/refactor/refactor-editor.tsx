import { cn } from "@/site/cn"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { NEW_LINES, OLD_LINES, REFACTOR_TABS } from "./refactor-code"
import type { RefactorFrame } from "./refactor-frame"
import { codeFontSize } from "./refactor-layout"
import { RefactorLine } from "./refactor-line"
import { RefactorTabs } from "./refactor-tabs"

interface RefactorEditorProps {
  frame: RefactorFrame
  lineHeight: number
  /** The hand-written lines, then the new ones, highlighted. */
  lines: readonly CodeToken[][]
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
 * a phone so that it shows whole.
 *
 * @param props - The frame, the line height and the highlighted lines
 * @returns The editor
 * @example
 * ```tsx
 * <RefactorEditor frame={frame} lineHeight={23} lines={lines} />
 * ```
 */
export function RefactorEditor({ frame, lineHeight, lines }: RefactorEditorProps) {
  const { text, tone } = status(frame)
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
        <div className="dots relative overflow-x-auto py-3">
          <div
            className="min-w-max font-mono text-fg-muted"
            style={{ fontSize: `${codeFontSize(lineHeight)}px` }}
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
