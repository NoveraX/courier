"use client"

import { useState } from "react"

import { runOnServer, type ServerRun, type ServerRunName } from "@/app/docs/examples/server-run"
import { RequestInspector } from "@/site/inspector/request-inspector"
import { ServerTrace } from "@/site/inspector/server-trace"
import { ResponseView } from "./response-view"
import { RunButton } from "./run-button"
import { Sandbox } from "./sandbox"
import { SandboxChoice } from "./sandbox-choice"

interface ServerRunSandboxProps {
  /** The call, as the sandbox's header names it. */
  label: string
  /** Its buttons, each running one of the calls the server runs. */
  runs: readonly { readonly button: string; readonly name: ServerRunName }[]
  /** The input the page lets the visitor pick, if any: an error code, a timeout. */
  choice?: { readonly label: string; readonly options: readonly number[] } | undefined
}

/**
 * A sandbox that runs its page's call on the site's server, in a Server
 * Action: what the call came to, how its way to the API went as the
 * server traced it, and the action's own POST as the browser recorded it.
 *
 * @param props - The call's name, its buttons, and the input to pick
 * @returns The sandbox
 * @example
 * ```tsx
 * <ServerRunSandbox label="action.misc.error({ code })" runs={[{ button: "Trigger it", name: "errors.error" }]} />
 * ```
 */
export function ServerRunSandbox({ label, runs, choice }: ServerRunSandboxProps) {
  const [picked, setPicked] = useState(choice?.options[0])
  const [pending, setPending] = useState(false)
  const [run, setRun] = useState<ServerRun | undefined>(undefined)
  const go = async (name: ServerRunName) => {
    setPending(true)
    setRun(undefined)
    try {
      setRun(await runOnServer(name, picked))
    } finally {
      setPending(false)
    }
  }
  const answer = run !== undefined && "answer" in run ? run.answer : undefined
  return (
    <Sandbox
      label={label}
      controls={
        <>
          {choice !== undefined && picked !== undefined && (
            <SandboxChoice
              label={choice.label}
              value={picked}
              options={choice.options}
              onChange={setPicked}
            />
          )}
          {runs.map(({ button, name }, index) => (
            <RunButton
              key={name}
              variant={index === 0 ? "primary" : "secondary"}
              loading={pending}
              label={button}
              onClick={() => void go(name)}
            />
          ))}
        </>
      }
      result={
        <div className="flex flex-col gap-3.5">
          <ResponseView
            data={answer?.data}
            error={run !== undefined && "refused" in run ? run.refused : answer?.error}
            status={answer?.status || undefined}
            pending={pending}
          />
          {run !== undefined && "trace" in run && run.trace !== undefined && (
            <ServerTrace trace={run.trace} />
          )}
        </div>
      }
      inspector={<RequestInspector actions />}
    />
  )
}
