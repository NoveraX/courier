"use client"

import { keys, q } from "@/lib/query"
import { RequestInspector } from "@/site/inspector/request-inspector"
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
      inspector={<RequestInspector calls={["api.users.getAll"]} />}
    />
  )
}

export function PostDemo() {
  const { mutate, data, isPending, error } = q.users.useMutation("create", {
    invalidate: [keys("users", "getAll")],
  })
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
      inspector={<RequestInspector calls={["api.users.create"]} followUps={["api.users.getAll"]} />}
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
      inspector={<RequestInspector calls={["api.users.getById"]} />}
    />
  )
}
