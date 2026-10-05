"use client"

import { q } from "@/lib/query"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"

export function GetDemo() {
  const { data, isLoading, error, refetch, isFetching } = q.users.useQuery("getAll")
  return (
    <Sandbox
      label='q.users.useQuery("getAll")'
      controls={
        <RunButton loading={isFetching} label="Fetch again" onClick={() => void refetch()} />
      }
      result={<ResponseView data={data} error={error?.message} pending={isLoading} />}
    />
  )
}

export function PostDemo() {
  const { mutate, data, isPending, error } = q.users.useMutation("create")
  return (
    <Sandbox
      label='q.users.useMutation("create")'
      controls={
        <RunButton
          loading={isPending}
          label="Create user"
          onClick={() => mutate({ name: "Jane Doe", email: "jane@example.com", role: "user" })}
        />
      }
      result={<ResponseView data={data} error={error?.message} pending={isPending} />}
    />
  )
}

export function ManualDemo() {
  const { data, isFetching, error, refetch } = q.users.useQuery("getById", {
    variables: { id: 1 },
    enabled: false,
  })
  return (
    <Sandbox
      label='q.users.useQuery("getById", { enabled: false })'
      controls={
        <RunButton loading={isFetching} label="Get user #1" onClick={() => void refetch()} />
      }
      result={<ResponseView data={data} error={error?.message} pending={isFetching} />}
    />
  )
}
