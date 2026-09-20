"use client"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { q } from "@/lib/query"

export function GetDemo() {
  const { data, isLoading, error } = q.users.useQuery("getAll")

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
  const { data, isFetching, error, refetch } = q.users.useQuery("getById", {
    variables: { id: 1 },
    enabled: false,
  })

  return (
    <>
      <RunButton loading={isFetching} label="Get User #1" onClick={() => void refetch()} />
      {error && <ResponseViewer error={error.message} />}
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}
