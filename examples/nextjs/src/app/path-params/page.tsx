"use client"

import { useState } from "react"
import { DemoCard } from "@/components/demo-card"
import { ResponseViewer } from "@/components/response-viewer"
import { RunButton } from "@/components/run-button"
import { useMutation } from "@/lib/request"

const simpleCode = `// Method definition with :id placeholder
getById: Method<User, { id: number }> = ({ get }) => get(":id");

// Usage — :id is replaced with the value from variables
await request("mockApi")("users:getById", { id: 1 });
// → GET /users/1`

const nestedCode = `// Multiple path params in one URL
getUserPost: Method<UserPostResponse, { id: number; postId: number }> =
  ({ get }) => get(":id/posts/:postId");

// Both :id and :postId are replaced
await request("mockApi")("users:getUserPost", { id: 1, postId: 2 });
// → GET /users/1/posts/2`

const mixedCode = `// Path params + query params work together
// Variables matching :placeholders go into the URL path
// Remaining variables go as query params

getAll: Method<UsersListResponse, { page?: number; limit?: number }> =
  ({ get }) => get();

// No path params — all variables become ?query params
await request("mockApi")("users:getAll", { page: 1, limit: 5 });
// → GET /users?page=1&limit=5`

export default function PathParamsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Path Parameters</h1>
        <p className="text-muted-foreground mt-1">
          Dynamic URL segments with :param placeholders, auto-replaced from variables.
        </p>
      </div>

      <SimpleParamDemo />
      <NestedParamsDemo />
      <MixedParamsDemo />
    </div>
  )
}

function SimpleParamDemo() {
  const [userId, setUserId] = useState(1)
  const { mutate, data, isPending, error } = useMutation("mockApi", "users:getById")

  return (
    <DemoCard
      title="Simple :id"
      description="A single path parameter replaced from the variables object."
      code={simpleCode}
    >
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">User ID:</label>
        <select
          value={userId}
          onChange={(e) => setUserId(Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {[1, 2, 3].map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
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
    </DemoCard>
  )
}

function NestedParamsDemo() {
  const [userId, setUserId] = useState(1)
  const [postId, setPostId] = useState(1)
  const { mutate, data, isPending, error } = useMutation("mockApi", "users:getUserPost")

  return (
    <DemoCard
      title="Nested :id/posts/:postId"
      description="Multiple path params in a single URL — all replaced from variables."
      code={nestedCode}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground">User ID:</label>
        <select
          value={userId}
          onChange={(e) => setUserId(Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {[1, 2, 3].map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <label className="text-sm text-muted-foreground">Post ID:</label>
        <select
          value={postId}
          onChange={(e) => setPostId(Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {[1, 2, 3, 4].map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
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
    </DemoCard>
  )
}

function MixedParamsDemo() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(2)
  const { mutate, data, isPending } = useMutation("mockApi", "users:getAll")

  return (
    <DemoCard
      title="Query Params"
      description="Variables that don't match a :placeholder become query parameters."
      code={mixedCode}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground">Page:</label>
        <select
          value={page}
          onChange={(e) => setPage(Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {[1, 2, 3].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label className="text-sm text-muted-foreground">Limit:</label>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {[1, 2, 5, 10].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <RunButton
          loading={isPending}
          label={`GET /users?page=${page}&limit=${limit}`}
          onClick={() => mutate({ page, limit })}
        />
      </div>
      {data ? <ResponseViewer data={data} status={200} /> : null}
    </DemoCard>
  )
}
