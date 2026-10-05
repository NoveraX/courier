"use client"

import { Loader2, Trash2 } from "lucide-react"
import { useActionState } from "react"

import { type ActionState, deleteUser } from "./actions"

type User = {
  id: number
  name: string
  email: string
  role: string
  createdAt: string
}

export function UserList({ users }: { users: User[] }) {
  if (users.length === 0) {
    return <p className="m-0 text-body text-fg-subtle">No users found.</p>
  }
  return (
    <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-panel border border-line bg-panel p-0 shadow-panel">
      {users.map((user) => (
        <UserRow key={user.id} user={user} />
      ))}
    </ul>
  )
}

function UserRow({ user }: { user: User }) {
  const [state, action, isPending] = useActionState<ActionState, FormData>(deleteUser, {})
  if (state.success) return null
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-control font-medium text-fg">{user.name}</span>
          <span className="rounded-chip border border-line px-1.5 py-px font-mono text-[10.5px] text-fg-muted">
            {user.role}
          </span>
        </div>
        <p className="m-0 mt-0.5 truncate text-label text-fg-subtle">{user.email}</p>
      </div>
      <form action={action}>
        <input type="hidden" name="id" value={user.id} />
        <button
          type="submit"
          aria-label={`Delete ${user.name}`}
          disabled={isPending}
          className="grid size-8 cursor-pointer place-items-center rounded-control text-fg-subtle transition-colors hover:bg-raised hover:text-err disabled:cursor-default"
        >
          {isPending ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="size-3.5" />
          )}
        </button>
      </form>
    </li>
  )
}
