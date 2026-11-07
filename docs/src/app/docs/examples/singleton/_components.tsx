"use client"

import { useState } from "react"

import { q } from "@/lib/query"
import { RequestInspector } from "@/site/inspector/request-inspector"
import { LabeledResponse } from "@/site/sandbox/labeled-response"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"

/* One of two components that read the users, each on its own, through the app's one `q`. */
function Reader({ name }: { name: string }) {
  const { data, error, isLoading } = q.users.useQuery("getAll")
  return (
    <LabeledResponse
      label={`${name} · q.users.useQuery("getAll")`}
      data={data === undefined ? undefined : { total: data.total }}
      error={error}
      pending={isLoading}
    />
  )
}

export function SharedInstanceDemo() {
  const [shown, setShown] = useState(false)
  return (
    <Sandbox
      label="Two readers, one q"
      controls={
        <RunButton
          label={shown ? "Hide the readers" : "Show two readers"}
          onClick={() => setShown((was) => !was)}
        />
      }
      result={
        shown ? (
          <div className="flex flex-col gap-4">
            <Reader name="header" />
            <Reader name="sidebar" />
          </div>
        ) : (
          <p className="m-0 font-mono text-meta text-code-comment">
            {"// show them: each reads the users itself"}
          </p>
        )
      }
      inspector={<RequestInspector calls={["api.users.getAll"]} />}
    />
  )
}
