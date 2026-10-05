"use client"

import { useState } from "react"

import { q } from "@/lib/query"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"
import type { User } from "./user-rows"
import { UserRows } from "./user-rows"

export function CrudDemo() {
  const [selected, setSelected] = useState<User | null>(null)
  const { data, isLoading, refetch } = q.users.useQuery("getAll")
  const done = () => {
    void refetch()
    setSelected(null)
  }
  const create = q.users.useMutation("create", { onSuccess: () => void refetch() })
  const update = q.users.useMutation("update", { onSuccess: done })
  const patch = q.users.useMutation("patch", { onSuccess: done })
  const remove = q.users.useMutation("remove", { onSuccess: done })
  const users: User[] = data?.data ?? []
  const latest = [create, update, patch, remove].find(
    (call) => call.data !== undefined || call.error
  )
  return (
    <Sandbox
      label="q.users — create · update · patch · remove"
      controls={
        <>
          <RunButton
            loading={create.isPending}
            label="Create user"
            onClick={() => {
              const tag = Date.now().toString(36)
              create.mutate({ name: `User ${tag}`, email: `user-${tag}@example.com` })
            }}
          />
          {selected && (
            <>
              <RunButton
                variant="secondary"
                loading={update.isPending}
                label={`PUT #${selected.id}`}
                onClick={() =>
                  update.mutate({
                    id: selected.id,
                    name: `${selected.name} (updated)`,
                    email: selected.email,
                    role: "moderator",
                  })
                }
              />
              <RunButton
                variant="secondary"
                loading={patch.isPending}
                label={`PATCH #${selected.id}`}
                onClick={() =>
                  patch.mutate({ id: selected.id, name: `${selected.name} (patched)` })
                }
              />
              <RunButton variant="secondary" label="Deselect" onClick={() => setSelected(null)} />
            </>
          )}
        </>
      }
      result={
        <>
          <UserRows
            users={users}
            loading={isLoading}
            selected={selected}
            removing={remove.isPending}
            onSelect={setSelected}
            onRemove={(user) => remove.mutate({ id: user.id })}
          />
          <ResponseView data={latest?.data} error={latest?.error?.message} />
        </>
      }
    />
  )
}

const OPERATIONS: readonly [string, string, string][] = [
  ["POST", "users:create", "creates a user"],
  ["PUT", "users:update", "replaces the whole user"],
  ["PATCH", "users:patch", "changes the fields given"],
  ["DELETE", "users:remove", "deletes the user"],
]

export function OperationsInfo() {
  return (
    <dl className="m-0 grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-2.5 rounded-panel border border-line bg-panel p-4.5 text-body">
      {OPERATIONS.map(([method, path, what]) => (
        <div key={method} className="contents">
          <dt className="font-mono text-small font-medium text-fg">{method}</dt>
          <dd className="m-0 text-fg-muted">
            <code>{path}</code> {what}
          </dd>
        </div>
      ))}
    </dl>
  )
}
