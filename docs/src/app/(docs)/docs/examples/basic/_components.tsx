"use client"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { useMutation, useQuery } from "@/lib/request"

export function GetDemo() {
  const { data, isLoading, error } = useQuery("mockApi", "users:getAll", { variables: {} })

  return (
    <>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <ResponseViewer error={error.message} />}
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}

export function PostDemo() {
  const { mutate, data, isPending, error } = useMutation("mockApi", "users:create")

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
  const { mutate, data, isPending, error } = useMutation("mockApi", "users:getById")

  return (
    <>
      <RunButton loading={isPending} label="Get User #1" onClick={() => mutate({ id: 1 })} />
      {error && <ResponseViewer error={error.message} />}
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}
