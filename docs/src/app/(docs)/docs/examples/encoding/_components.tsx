"use client"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { useMutation } from "@/lib/query"

export function BodyEncodingDemo() {
  const jsonMutation = useMutation("api", "echo:send")
  const encodedMutation = useMutation("encodedApi", "echo:send")
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
  const { mutate, data, isPending } = useMutation("encodedApi", "echo:retrieve")

  return (
    <>
      <RunButton
        loading={isPending}
        label="Fetch with Arrays"
        onClick={() => mutate({ tags: ["javascript", "react"], page: 1 })}
      />
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}

export function DefaultsDemo() {
  const postMutation = useMutation("encodedApi", "echo:send")
  const getMutation = useMutation("encodedApi", "echo:retrieve")

  return (
    <>
      <div className="flex gap-3">
        <RunButton
          loading={postMutation.isPending}
          label="POST (see defaultBody)"
          onClick={() => postMutation.mutate({ name: "John" })}
        />
        <RunButton
          loading={getMutation.isPending}
          label="GET (see defaultQueryParams)"
          onClick={() => getMutation.mutate({ page: 1 })}
        />
      </div>
      {(postMutation.data || getMutation.data) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {postMutation.data && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                POST body includes apiVersion:
              </p>
              <ResponseViewer data={postMutation.data} status={200} />
            </div>
          )}
          {getMutation.data && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                GET query includes format:
              </p>
              <ResponseViewer data={getMutation.data} status={200} />
            </div>
          )}
        </div>
      )}
    </>
  )
}
