"use client"

import { q } from "@/lib/query"
import { LabeledResponse } from "@/site/sandbox/labeled-response"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"

const GROUPS: readonly [string, string, string][] = [
  ["users", "/users/*", "getAll, getById, create, update, patch, remove"],
  ["posts", "/posts/*", "getAll, getById, create"],
  ["misc", "the root", "stream, slow, error"],
]

export function GroupInfo() {
  return (
    <div className="grid gap-2.5 min-[620px]:grid-cols-3">
      {GROUPS.map(([name, path, methods]) => (
        <div key={name} className="rounded-panel border border-line bg-panel p-4">
          <p className="m-0 font-mono text-small font-medium text-fg">{name}</p>
          <p className="m-0 mt-1.5 text-control text-fg-muted">
            calls <code>{path}</code>
          </p>
          <p className="m-0 mt-1 text-control text-fg-subtle">{methods}</p>
        </div>
      ))}
    </div>
  )
}

export function GroupsDemo() {
  const users = q.users.useQuery("getAll")
  const posts = q.posts.useQuery("getAll")
  const user = q.users.useQuery("getById", { variables: { id: 1 } })
  const fetching = users.isFetching || posts.isFetching || user.isFetching
  return (
    <Sandbox
      label="q.users · q.posts"
      controls={
        <RunButton
          loading={fetching}
          label="Fetch again"
          onClick={() => {
            void users.refetch()
            void posts.refetch()
            void user.refetch()
          }}
        />
      }
      result={
        <div className="flex flex-col gap-4">
          <LabeledResponse
            label="users.getAll"
            data={users.data}
            error={users.error}
            pending={users.isLoading}
          />
          <LabeledResponse
            label="posts.getAll"
            data={posts.data}
            error={posts.error}
            pending={posts.isLoading}
          />
          <LabeledResponse
            label="users.getById · id 1"
            data={user.data}
            error={user.error}
            pending={user.isLoading}
          />
        </div>
      }
    />
  )
}
