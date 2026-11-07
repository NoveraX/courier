"use client"

import { type ReactNode, useId, useState } from "react"

import { cn } from "@/site/cn"

const MODES = [
  { mode: "browser", label: "in the browser, through the proxy route" },
  { mode: "server", label: "on the server, in a Server Action" },
] as const

type Mode = (typeof MODES)[number]["mode"]

/**
 * Where an example's call runs, as the visitor picks it: in the browser
 * through the site's proxy route, or on the server in a Server Action —
 * each with its own code and its own sandbox, so the two ways can be set
 * side by side by their requests. Its two choices are radio buttons, as
 * the keyboard and a screen reader take them.
 *
 * @param props - The example's code and sandbox in the browser, and on the server
 * @returns The switch, and the way picked
 * @example
 * ```tsx
 * <ModeSwitch browser={<>{code}{sandbox}</>} server={<>{serverCode}{serverSandbox}</>} />
 * ```
 */
export function ModeSwitch({ browser, server }: { browser: ReactNode; server: ReactNode }) {
  const [mode, setMode] = useState<Mode>("browser")
  const group = useId()
  return (
    <div className="flex flex-col gap-3.5">
      <fieldset className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-0 p-0">
        <legend className="mb-1.5 font-mono text-meta text-fg-muted">run the call</legend>
        {MODES.map((choice) => (
          <label
            key={choice.mode}
            className={cn(
              "flex items-center gap-1.5 text-control",
              mode === choice.mode ? "text-fg" : "text-fg-muted"
            )}
          >
            <input
              type="radio"
              name={group}
              value={choice.mode}
              checked={mode === choice.mode}
              onChange={() => setMode(choice.mode)}
              className="accent-brand"
            />
            {choice.label}
          </label>
        ))}
      </fieldset>
      {mode === "browser" ? browser : server}
    </div>
  )
}
