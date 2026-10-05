"use client"

import { Pencil, Trash2 } from "lucide-react"

import { cn } from "@/site/cn"

export type User = {
  id: number
  name: string
  email: string
  role: string
  createdAt: string
}

const ICON =
  "grid size-7 cursor-pointer place-items-center rounded-chip text-fg-subtle transition-colors hover:bg-raised hover:text-fg disabled:cursor-default disabled:opacity-50"

/** The backend's users, each with buttons to pick it for an update and to delete it. */
export function UserRows({
  users,
  loading,
  selected,
  removing,
  onSelect,
  onRemove,
}: {
  users: readonly User[]
  loading: boolean
  selected: User | null
  removing: boolean
  onSelect: (user: User) => void
  onRemove: (user: User) => void
}) {
  return (
    <ul className="m-0 mb-3.5 list-none divide-y divide-line overflow-hidden rounded-control border border-line p-0">
      {users.map((user) => (
        <li
          key={user.id}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 text-control",
            selected?.id === user.id && "bg-brand-dim"
          )}
        >
          <span className="font-medium text-fg">{user.name}</span>
          <span className="min-w-0 truncate text-fg-subtle">{user.email}</span>
          <span className="rounded-chip bg-raised px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
            {user.role}
          </span>
          <span className="ml-auto flex gap-0.5">
            <button
              type="button"
              aria-label={`Edit ${user.name}`}
              className={ICON}
              onClick={() => onSelect(user)}
            >
              <Pencil aria-hidden="true" className="size-3.25" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${user.name}`}
              className={cn(ICON, "hover:text-err")}
              disabled={removing}
              onClick={() => onRemove(user)}
            >
              <Trash2 aria-hidden="true" className="size-3.25" />
            </button>
          </span>
        </li>
      ))}
      {users.length === 0 && !loading && (
        <li className="px-3 py-5 text-center text-control text-fg-subtle">No users. Create one.</li>
      )}
    </ul>
  )
}
