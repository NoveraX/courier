import { ArrowRight, ArrowUpRight, Circle, CircleCheck, Sparkles, Zap } from "lucide-react"
import { cn } from "@/site/cn"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { TokenLine } from "@/site/code/token-line"
import { managerOf, PACKAGE_MANAGERS, STUDIO_PACKAGE } from "./setup-data"

/**
 * The setup step: Courier's one command for each package manager, the
 * picked one marked, and the words for adding Studio by hand.
 *
 * @param props - The package manager picked, and what picks one
 * @returns The rows
 * @example
 * ```tsx
 * <InstallPanel picked="npm" onPick={setManager} />
 * ```
 */
export function InstallPanel({ picked, onPick }: { picked: string; onPick: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2.5 px-4.5 py-1.5">
      {PACKAGE_MANAGERS.map((manager) => {
        const on = manager.id === picked
        const Mark = on ? CircleCheck : Circle
        return (
          <button
            key={manager.id}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(manager.id)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2 text-left font-mono text-control hover:border-line-strong",
              on ? "border-brand/45 bg-brand/6" : "border-line bg-inset"
            )}
          >
            <span className="w-9 shrink-0 text-[11px] text-fg-subtle">{manager.id}</span>
            <span className="min-w-0 flex-1 leading-normal [overflow-wrap:anywhere]">
              <span className="text-fg-subtle">$ </span>
              <span className="text-code-keyword">{manager.setup[0]}</span>{" "}
              <span className="text-code-plain">{manager.setup[1]}</span>
            </span>
            <Mark
              aria-hidden="true"
              className={cn("size-3.25 shrink-0", on ? "text-brand" : "text-fg-subtle")}
            />
          </button>
        )
      })}
      <p className="m-0 pt-0.5 font-mono text-label text-fg-subtle [overflow-wrap:anywhere]">
        By hand: {managerOf(picked).add} {STUDIO_PACKAGE}
      </p>
    </div>
  )
}

/**
 * The connect step's code, numbered, the lines that name Courier lit.
 *
 * @param props - The code's lines, highlighted, and its text
 * @returns The code
 * @example
 * ```tsx
 * <CodePanel lines={lines} code={code} />
 * ```
 */
export function CodePanel({ lines, code }: { lines: readonly CodeToken[][]; code: string }) {
  const texts = code.split("\n")
  return (
    <pre className="m-0 overflow-x-auto text-[12.5px] leading-[1.75]">
      {lines.map((line, at) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a code sample's lines are fixed and never reorder
          key={at}
          className={cn("flex min-h-5.5", /courier/i.test(texts[at] ?? "") && "bg-brand/6")}
        >
          <span className="w-11 shrink-0 pr-4 text-right text-fg-subtle/50 select-none">
            {at + 1}
          </span>
          <span className="min-w-0 flex-1 pr-4 whitespace-pre-wrap [overflow-wrap:anywhere]">
            <TokenLine tokens={line} />
          </span>
        </div>
      ))}
    </pre>
  )
}

/* What Studio prints when it is up, the app started as the package manager starts it. */
const outputFor = (dev: string) => [
  {
    icon: Zap,
    tone: "text-warn",
    key: "Courier Studio",
    value: "v0.0.0 · ready in 146 ms",
    valueTone: "text-fg-muted",
  },
  {
    icon: ArrowRight,
    tone: "text-ok",
    key: "Local",
    value: "http://localhost:6280/#token=…",
    valueTone: "text-brand",
  },
  {
    icon: Sparkles,
    tone: "text-brand",
    key: "Your app",
    value: `${dev} — it connects on its own`,
    valueTone: "text-fg",
  },
]

/**
 * The start step: the script the one command adds, as the picked package
 * manager runs it — and how to start Studio by hand — what Studio prints
 * when it is up, and the way to open it.
 *
 * @param props - The package manager picked
 * @returns The panel
 * @example
 * ```tsx
 * <RunPanel manager="pnpm" />
 * ```
 */
export function RunPanel({ manager }: { manager: string }) {
  const { studio, run, dev } = managerOf(manager)
  const [runner, ...script] = studio.split(" ")
  return (
    <div className="flex flex-col gap-3.5 px-4.5 py-1 font-mono text-[12.5px]">
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span>
          <span className="text-fg-subtle">$ </span>
          <span className="text-code-keyword">{runner}</span> {script.join(" ")}
        </span>
        <span className="text-label text-fg-subtle">by hand: {run.join(" ")}</span>
      </span>
      <div className="flex flex-col gap-2 rounded-panel border border-line bg-inset p-3.5">
        {outputFor(dev).map(({ icon: Icon, tone, key, value, valueTone }) => (
          <div
            key={key}
            className="grid grid-cols-[18px_minmax(88px,120px)_minmax(0,1fr)] items-baseline gap-2.5"
          >
            <Icon aria-hidden="true" className={cn("size-3", tone)} />
            <span className="text-fg-muted">{key}</span>
            <span className={cn("[overflow-wrap:anywhere]", valueTone)}>{value}</span>
          </div>
        ))}
      </div>
      <a
        href="http://localhost:6280"
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 items-center gap-2 self-start rounded-[9px] bg-brand px-3.5 font-sans text-control font-semibold text-bg hover:text-bg hover:opacity-88"
      >
        Open localhost:6280
        <ArrowUpRight aria-hidden="true" className="size-3.25" />
      </a>
    </div>
  )
}
