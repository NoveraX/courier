import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const signatureCode = `const result = useMutation(source, query, options?)

// source  — key from your Sources type (e.g. "myApi")
// query   — "group:method" string (e.g. "users:create")
// options — { requestOptions?, ...reactQueryMutationOptions }

// Returns: UseMutationResult with typed mutate function
// result.mutate(variables)   — fire and forget
// result.mutateAsync(variables) — returns Promise<R>`

const createCode = `"use client"

import { useMutation } from "@/lib/request"

export function CreateUserForm() {
  // Method<User, { name: string; email: string; role: string }>
  const { mutate, isPending } = useMutation("myApi", "users:create", {
    onSuccess: (user) => {
      console.log("Created:", user.name) // ← user is typed as User
    },
    onError: (error) => {
      console.error("Failed:", error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)

    mutate({
      name: form.get("name") as string,
      email: form.get("email") as string,
      role: "user",
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" placeholder="Name" required />
      <input name="email" type="email" placeholder="Email" required />
      <button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create User"}
      </button>
    </form>
  )
}`

const updateCode = `"use client"

import { useMutation } from "@/lib/request"

export function EditUserForm({ user }: { user: User }) {
  // Method<User, { id: number; name: string; email: string }>
  const { mutate, isPending } = useMutation("myApi", "users:update")

  const handleSave = (name: string, email: string) => {
    // Variables passed to mutate(), not to the hook options
    mutate({
      id: user.id,
      name,
      email,
    })
    // ^? TypeScript enforces { id: number; name: string; email: string }
  }

  return (
    <button onClick={() => handleSave("Jane", "jane@test.com")} disabled={isPending}>
      Save
    </button>
  )
}`

const deleteCode = `"use client"

import { useMutation } from "@/lib/request"

export function DeleteUserButton({ userId }: { userId: number }) {
  // Method<null, { id: number }> → mutate takes { id: number }
  const { mutate, isPending } = useMutation("myApi", "users:remove", {
    onSuccess: () => {
      console.log("User deleted")
    },
  })

  return (
    <button onClick={() => mutate({ id: userId })} disabled={isPending}>
      {isPending ? "Deleting..." : "Delete"}
    </button>
  )
}`

const optimisticCode = `"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useMutation, useQuery } from "@/lib/request"

type User = { id: number; name: string; email: string }

export function UserManager() {
  const queryClient = useQueryClient()
  const { data: users } = useQuery("myApi", "users:getAll")

  const { mutate: updateUser } = useMutation("myApi", "users:update", {
    // 1. Cancel outgoing refetches so they don't overwrite our optimistic update
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["myApi", "users:getAll"] })

      // 2. Snapshot the previous value
      const previous = queryClient.getQueryData<User[]>(["myApi", "users:getAll"])

      // 3. Optimistically update the cache
      queryClient.setQueryData<User[]>(["myApi", "users:getAll"], (old) =>
        old?.map((u) => (u.id === variables.id ? { ...u, ...variables } : u))
      )

      return { previous }
    },

    // 4. On error, roll back to the previous value
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["myApi", "users:getAll"], context.previous)
      }
    },

    // 5. Always refetch after error or success to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["myApi", "users:getAll"] })
    },
  })

  return (
    <ul>
      {users?.map((user) => (
        <li key={user.id}>
          {user.name}
          <button onClick={() => updateUser({ id: user.id, name: "Updated", email: user.email })}>
            Update
          </button>
        </li>
      ))}
    </ul>
  )
}`

const invalidationCode = `"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useMutation } from "@/lib/request"

export function CreateUserForm() {
  const queryClient = useQueryClient()

  const { mutate } = useMutation("myApi", "users:create", {
    onSuccess: () => {
      // Invalidate the users list so it refetches
      queryClient.invalidateQueries({ queryKey: ["myApi", "users:getAll"] })

      // Or invalidate all queries for this source
      // queryClient.invalidateQueries({ queryKey: ["myApi"] })
    },
  })

  return (
    <button onClick={() => mutate({ name: "Jane", email: "jane@test.com", role: "user" })}>
      Create
    </button>
  )
}`

export const metadata = docsMetadata("useMutation", "Create, update, and delete data with type-safe mutations and automatic variable inference.")

export default async function UseMutationPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="useMutation"
        description="Create, update, and delete data with type-safe mutations and automatic variable inference."
      />

      <Prose>
        <h2 id="signature">Signature</h2>

        <p>
          <InlineCode>useMutation</InlineCode> takes a source name, a{" "}
          <InlineCode>{'"group:method"'}</InlineCode> query string, and optional React Query
          mutation options. Variables are passed to <InlineCode>mutate()</InlineCode>, not to the
          hook:
        </p>
      </Prose>

      <CodeBlock code={signatureCode} />

      <Callout variant="info" title="Variables go to mutate(), not the hook">
        <p>
          Unlike <InlineCode>useQuery</InlineCode> where variables are passed in the options object,{" "}
          <InlineCode>useMutation</InlineCode> receives variables through the{" "}
          <InlineCode>mutate(variables)</InlineCode> call. This follows the standard React Query
          mutation pattern.
        </p>
      </Callout>

      <Prose>
        <h2 id="create">Create mutation</h2>

        <p>
          The most common pattern — submit a form and create a resource. The{" "}
          <InlineCode>mutate</InlineCode> function is typed based on the method&apos;s variable
          type:
        </p>
      </Prose>

      <CodeBlock code={createCode} filename="components/create-user-form.tsx" />

      <Prose>
        <h2 id="update">Update mutation</h2>

        <p>
          For updates, pass all required fields (including the ID for path parameters) to{" "}
          <InlineCode>mutate()</InlineCode>. Nexus extracts path parameters automatically:
        </p>
      </Prose>

      <CodeBlock code={updateCode} filename="components/edit-user-form.tsx" />

      <Prose>
        <h2 id="delete">Delete mutation</h2>

        <p>
          Delete methods typically return <InlineCode>null</InlineCode> and only need an ID. The
          variable type is inferred from the method definition:
        </p>
      </Prose>

      <CodeBlock code={deleteCode} filename="components/delete-user-button.tsx" />

      <Prose>
        <h2 id="cache-invalidation">Cache invalidation</h2>

        <p>
          After a mutation succeeds, invalidate related queries to trigger a refetch. Use the
          auto-generated query key format <InlineCode>{`[source, query, variables?]`}</InlineCode>:
        </p>
      </Prose>

      <CodeBlock code={invalidationCode} filename="components/create-user-form.tsx" />

      <Callout variant="tip" title="Partial key invalidation">
        <p>
          Passing <InlineCode>{`{ queryKey: ["myApi"] }`}</InlineCode> invalidates every query for
          that source. Use <InlineCode>{`{ queryKey: ["myApi", "users:getAll"] }`}</InlineCode> to
          target a specific endpoint.
        </p>
      </Callout>

      <Prose>
        <h2 id="optimistic-updates">Optimistic updates</h2>

        <p>
          For instant UI feedback, update the cache optimistically before the server responds. Roll
          back on error, and always refetch on settle to ensure consistency:
        </p>
      </Prose>

      <CodeBlock code={optimisticCode} filename="components/user-manager.tsx" />

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/react-query/use-query">useQuery</Link> — fetch data with type-safe
            queries
          </li>
          <li>
            <Link href="/docs/react-query/advanced">Advanced Patterns</Link> — prefetching,
            hydration, infinite queries, and more
          </li>
          <li>
            <Link href="/docs/server-side/actions">Server Actions</Link> — mutations using Server
            Actions instead of proxy mode
          </li>
          <li>
            <Link href="/docs/core-concepts/error-handling">Error Handling</Link> — handling
            mutation errors and HTTP status codes
          </li>
        </ul>
      </Prose>
    </div>
  )
}
