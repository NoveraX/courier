"use client"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { encodedQ, q } from "@/lib/query"

export function BodyEncodingDemo() {
  const jsonMutation = q.echo.useMutation("send")
  const encodedMutation = encodedQ.echo.useMutation("send")
  const variables = { name: "John", role: "admin" }

  return (
    <>
      <div className="flex gap-3">
        <RunButton
          loading={jsonMutation.isPending}
          label="JSON (default)"
          onClick={() => jsonMutation.mutate(variables)}
        />
        <RunButton
          loading={encodedMutation.isPending}
          label="URL-Encoded"
          onClick={() => encodedMutation.mutate(variables)}
        />
      </div>
      {(jsonMutation.data || encodedMutation.data) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {jsonMutation.data && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">JSON result:</p>
              <ResponseViewer data={jsonMutation.data} status={200} />
            </div>
          )}
          {encodedMutation.data && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">URL-encoded result:</p>
              <ResponseViewer data={encodedMutation.data} status={200} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

export function SearchParamsDemo() {
  const { data, isFetching, refetch } = encodedQ.echo.useQuery("retrieve", {
    variables: { tags: ["javascript", "react"], page: 1 },
    enabled: false,
  })

  return (
    <>
      <RunButton loading={isFetching} label="Fetch with Arrays" onClick={() => void refetch()} />
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}

export function DefaultsDemo() {
  const postMutation = encodedQ.echo.useMutation("send")
  const getQuery = encodedQ.echo.useQuery("retrieve", {
    variables: { page: 1 },
    enabled: false,
  })

  return (
    <>
      <div className="flex gap-3">
        <RunButton
          loading={postMutation.isPending}
          label="POST (see defaultBody)"
          onClick={() => postMutation.mutate({ name: "John" })}
        />
        <RunButton
          loading={getQuery.isFetching}
          label="GET (see defaultQueryParams)"
          onClick={() => void getQuery.refetch()}
        />
      </div>
      {(postMutation.data || getQuery.data) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {postMutation.data && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                POST body includes apiVersion:
              </p>
              <ResponseViewer data={postMutation.data} status={200} />
            </div>
          )}
          {getQuery.data && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                GET query includes format:
              </p>
              <ResponseViewer data={getQuery.data} status={200} />
            </div>
          )}
        </div>
      )}
    </>
  )
}
