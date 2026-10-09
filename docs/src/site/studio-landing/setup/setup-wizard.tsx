"use client"

import { ArrowRight, Check, Copy, FileCode, Terminal } from "lucide-react"
import { useState } from "react"
import { cn } from "@/site/cn"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { copyText } from "@/site/copy-text"
import { BrandIcon } from "@/site/landing/brand-icon"
import { useFlash } from "@/site/use-flash"
import { CONNECTIONS, managerOf, STUDIO_PACKAGE } from "./setup-data"
import { CodePanel, InstallPanel, RunPanel } from "./setup-panels"
import { SetupSteps } from "./setup-steps"

/** A framework's connection, its code highlighted and its mark. */
export interface ShownConnection {
  id: string
  label: string
  file: string
  code: string
  icon: string
  lines: CodeToken[][]
}

const HINTS = [
  "Pick your package manager",
  "Highlighted lines are all you add",
  "Keep it running while you work",
]

function copyFor(step: number, manager: string, connection: ShownConnection | undefined): string {
  if (step === 0) return `${managerOf(manager).add} ${STUDIO_PACKAGE}`
  return step === 1 ? (connection?.code ?? "") : managerOf(manager).run.join(" ")
}

/**
 * Studio's setup, a step at a time: install it, connect your app — five
 * frameworks to pick from — and start it. Each step's text copies in one
 * click.
 *
 * @param props - The frameworks' connections
 * @returns The wizard
 * @example
 * ```tsx
 * <SetupWizard connections={connections} />
 * ```
 */
export function SetupWizard({ connections }: { connections: readonly ShownConnection[] }) {
  const [step, setStep] = useState(0)
  const [manager, setManager] = useState("npm")
  const [framework, setFramework] = useState<string>(CONNECTIONS[0]?.id ?? "react")
  const [copied, flash] = useFlash()
  const connection = connections.find((c) => c.id === framework) ?? connections[0]
  const file = step === 0 ? "terminal" : step === 1 ? (connection?.file ?? "") : "terminal — studio"
  return (
    <div className="relative grid grid-cols-1 overflow-hidden rounded-[18px] border border-line bg-panel shadow-(--studio-shadow) min-[900px]:grid-cols-[300px_minmax(0,1fr)]">
      <SetupSteps current={step} onPick={setStep} />
      <div className="flex min-h-80 min-w-0 flex-col">
        <div className="flex h-11 items-center gap-2.5 border-b border-line pr-2.5 pl-4">
          <span aria-hidden="true" className="flex gap-1.5">
            {["a", "b", "c"].map((dot) => (
              <span key={dot} className="size-2.5 rounded-full bg-raised" />
            ))}
          </span>
          <span className="flex min-w-0 items-center gap-1.75 font-mono text-label text-fg-muted">
            {step === 1 ? (
              <FileCode aria-hidden="true" className="size-3 text-fg-subtle" />
            ) : (
              <Terminal aria-hidden="true" className="size-3 text-fg-subtle" />
            )}
            <span className="truncate">{file}</span>
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={async () => flash(await copyText(copyFor(step, manager, connection)))}
            className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] border border-line bg-panel-subtle px-2.5 text-label text-fg-muted hover:border-line-strong hover:text-fg"
          >
            {copied ? (
              <Check aria-hidden="true" className="size-3" />
            ) : (
              <Copy aria-hidden="true" className="size-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {step === 1 && (
          <div className="flex gap-0.5 overflow-x-auto px-4 pt-2.5 [scrollbar-width:none]">
            {connections.map((item) => {
              const on = item.id === framework
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFramework(item.id)}
                  className={cn(
                    "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] border px-2.5 text-label font-[550] whitespace-nowrap",
                    on
                      ? "border-line-strong bg-raised text-fg"
                      : "border-transparent bg-transparent text-fg-subtle"
                  )}
                >
                  <BrandIcon path={item.icon} className="size-3.25" />
                  {item.label}
                </button>
              )
            })}
          </div>
        )}
        <div className="flex-1 bg-panel pt-3.5 pb-4.5">
          {step === 0 && <InstallPanel picked={manager} onPick={setManager} />}
          {step === 1 && connection && (
            <CodePanel lines={connection.lines} code={connection.code} />
          )}
          {step === 2 && <RunPanel manager={manager} />}
        </div>
        <div className="flex h-12 items-center gap-2.5 border-t border-line bg-bg-subtle px-4">
          <span className="text-label text-fg-subtle">{HINTS[step]}</span>
          <div className="flex-1" />
          {step < 2 && (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="flex h-7.5 cursor-pointer items-center gap-1.5 rounded-control bg-fg px-3 text-small font-semibold text-bg"
            >
              {step === 0 ? "Next: connect" : "Next: start"}
              <ArrowRight aria-hidden="true" className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
