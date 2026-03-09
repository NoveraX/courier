"use client"

import { useState } from "react"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { useMutation } from "@/lib/request"

export function SimpleParamDemo() {
  const [userId, setUserId] = useState(1)
  const { mutate, data, isPending, error } = useMutation("mockApi", "users:getById")

  return (
    <>
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">
          User ID:
          <select
            value={userId}
            onChange={(e) => setUserId(Number(e.target.value))}
            className="ml-1 rounded-md border bg-background px-2 py-1 text-sm"
          >
            {[1, 2, 3].map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <RunButton
          loading={isPending}
          label={`GET /users/${userId}`}
          onClick={() => mutate({ id: userId })}
        />
      </div>
      {error ? (
        <ResponseViewer error={error.message} />
      ) : data ? (
        <ResponseViewer data={data} status={200} />
      ) : null}
    </>
  )
}

export function NestedParamsDemo() {
  const [userId, setUserId] = useState(1)
  const [postId, setPostId] = useState(1)
  const { mutate, data, isPending, error } = useMutation("mockApi", "users:getUserPost")

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground">
          User ID:
          <select
            value={userId}
            onChange={(e) => setUserId(Number(e.target.value))}
            className="ml-1 rounded-md border bg-background px-2 py-1 text-sm"
          >
            {[1, 2, 3].map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted-foreground">
          Post ID:
          <select
            value={postId}
            onChange={(e) => setPostId(Number(e.target.value))}
            className="ml-1 rounded-md border bg-background px-2 py-1 text-sm"
          >
            {[1, 2, 3, 4].map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <RunButton
          loading={isPending}
          label={`GET /users/${userId}/posts/${postId}`}
          onClick={() => mutate({ id: userId, postId })}
        />
      </div>
      {error ? (
        <ResponseViewer error={error.message} />
      ) : data ? (
        <ResponseViewer data={data} status={200} />
      ) : null}
    </>
  )
}

export function MixedParamsDemo() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(2)
  const { mutate, data, isPending } = useMutation("mockApi", "users:getAll")

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground">
          Page:
          <select
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            className="ml-1 rounded-md border bg-background px-2 py-1 text-sm"
          >
            {[1, 2, 3].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted-foreground">
          Limit:
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="ml-1 rounded-md border bg-background px-2 py-1 text-sm"
          >
            {[1, 2, 5, 10].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <RunButton
          loading={isPending}
          label={`GET /users?page=${page}&limit=${limit}`}
          onClick={() => mutate({ page, limit })}
        />
      </div>
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}
