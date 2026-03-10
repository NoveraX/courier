"use client"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { q } from "@/lib/query"

export function GetDemo() {
  const { data, isLoading, error } = q.users.useQuery("getAll", { variables: {} })

  return (
    <>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <ResponseViewer error={error.message} />}
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}

export function PostDemo() {
  const { mutate, data, isPending, error } = q.users.useMutation("create")

  return (
    <>
      <RunButton
        loading={isPending}
        label="Create User"
        onClick={() => mutate({ name: "Jane Doe", email: "jane@example.com", role: "user" })}
      />
      {error && <ResponseViewer error={error.message} />}
      {data && <ResponseViewer data={data} status={201} />}
    </>
  )
}

export function ManualDemo() {
  const { mutate, data, isPending, error } = q.users.useMutation("getById")

  return (
    <>
      <RunButton loading={isPending} label="Get User #1" onClick={() => mutate({ id: 1 })} />
      {error && <ResponseViewer error={error.message} />}
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}
