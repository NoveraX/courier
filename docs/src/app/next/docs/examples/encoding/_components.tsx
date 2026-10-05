"use client"

import { encodedQ, q } from "@/lib/query"
import { LabeledResponse } from "@/site/sandbox/labeled-response"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"

const VARIABLES = { name: "John", role: "admin" }

export function BodyEncodingDemo() {
  const json = q.echo.useMutation("send")
  const encoded = encodedQ.echo.useMutation("send")
  return (
    <Sandbox
      label="echo.send — two body encodings"
      controls={
        <>
          <RunButton
            loading={json.isPending}
            label="JSON (default)"
            onClick={() => json.mutate(VARIABLES)}
          />
          <RunButton
            variant="secondary"
            loading={encoded.isPending}
            label="URL-encoded"
            onClick={() => encoded.mutate(VARIABLES)}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-4">
          <LabeledResponse
            label="JSON body"
            data={json.data}
            error={json.error}
            pending={json.isPending}
          />
          <LabeledResponse
            label="URL-encoded body"
            data={encoded.data}
            error={encoded.error}
            pending={encoded.isPending}
          />
        </div>
      }
    />
  )
}

export function SearchParamsDemo() {
  const { data, isFetching, error, refetch } = encodedQ.echo.useQuery("retrieve", {
    variables: { tags: ["javascript", "react"], page: 1 },
    enabled: false,
  })
  return (
    <Sandbox
      label="echo.retrieve — arrays in the query"
      controls={
        <RunButton loading={isFetching} label="Fetch with arrays" onClick={() => void refetch()} />
      }
      result={<ResponseView data={data} error={error?.message} pending={isFetching} />}
    />
  )
}

export function DefaultsDemo() {
  const post = encodedQ.echo.useMutation("send")
  const get = encodedQ.echo.useQuery("retrieve", { variables: { page: 1 }, enabled: false })
  return (
    <Sandbox
      label="echo — defaultBody · defaultQueryParams"
      controls={
        <>
          <RunButton
            loading={post.isPending}
            label="POST (defaultBody)"
            onClick={() => post.mutate({ name: "John" })}
          />
          <RunButton
            variant="secondary"
            loading={get.isFetching}
            label="GET (defaultQueryParams)"
            onClick={() => void get.refetch()}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-4">
          <LabeledResponse
            label="POST body, with apiVersion added"
            data={post.data}
            error={post.error}
            pending={post.isPending}
          />
          <LabeledResponse
            label="GET query, with format added"
            data={get.data}
            error={get.error}
            pending={get.isFetching}
          />
        </div>
      }
    />
  )
}
