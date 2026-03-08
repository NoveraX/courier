import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const basicActionCode = `// app/actions/users.ts
"use server"

import { headers } from "next/headers"
import { directRequest } from "@/lib/direct-request"

type CreateUserInput = { name: string; email: string; role: string }

export async function createUser(data: CreateUserInput) {
  const user = await directRequest("myApi")(
    "users:create",
    data,
    { headers: await headers() }
  )

  return user
}`

const revalidatePathCode = `// app/actions/users.ts
"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { directRequest } from "@/lib/direct-request"

export async function updateUser(data: { id: number; name: string; email: string }) {
  const user = await directRequest("myApi")(
    "users:update",
    data,
    { headers: await headers() }
  )

  // Revalidate the users list and the specific user page
  revalidatePath("/dashboard")
  revalidatePath(\`/users/\${data.id}\`)

  return user
}`

const revalidateTagCode = `// app/actions/posts.ts
"use server"

import { headers } from "next/headers"
import { revalidateTag } from "next/cache"
import { directRequest } from "@/lib/direct-request"

export async function deletePost(id: number) {
  await directRequest("myApi")(
    "posts:remove",
    { id },
    { headers: await headers() }
  )

  // Revalidate all cached data tagged with "posts"
  revalidateTag("posts")
}`

const errorHandlingCode = `// app/actions/users.ts
"use server"

import { headers } from "next/headers"
import { directRequest } from "@/lib/direct-request"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createUser(
  data: { name: string; email: string }
): Promise<ActionResult<{ id: number; name: string; email: string }>> {
  try {
    const user = await directRequest("myApi")(
      "users:create",
      data,
      { headers: await headers() }
    )

    return { success: true, data: user }
  } catch (error) {
    // HTTPError from ky — contains status code and response
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }

    return { success: false, error: "An unexpected error occurred" }
  }
}`

const formUsageCode = `// app/users/create-form.tsx
"use client"

import { useActionState } from "react"
import { createUser } from "@/app/actions/users"

export function CreateUserForm() {
  const [state, action, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const result = await createUser({
        name: formData.get("name") as string,
        email: formData.get("email") as string,
      })

      if (!result.success) return { error: result.error }
      return { success: true, user: result.data }
    },
    null
  )

  return (
    <form action={action}>
      <input name="name" placeholder="Name" required />
      <input name="email" type="email" placeholder="Email" required />
      <button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create User"}
      </button>
      {state?.error && <p className="text-red-500">{state.error}</p>}
    </form>
  )
}`

const mutationCode = `// app/users/create-button.tsx
"use client"

import { useMutation } from "@/lib/request"

export function CreateUserButton() {
  // useMutation calls the proxy route, not a Server Action
  // Use this when you want React Query's cache management
  const { mutate, isPending } = useMutation("myApi", "users:create", {
    onSuccess: (user) => {
      console.log("Created:", user.name)
    },
  })

  return (
    <button
      onClick={() => mutate({ name: "Jane", email: "jane@test.com", role: "user" })}
      disabled={isPending}
    >
      {isPending ? "Creating…" : "Add User"}
    </button>
  )
}`

const returnVsRevalidateCode = `// Pattern 1: Return data — let the client decide what to do
export async function getUser(id: number) {
  return await directRequest("myApi")(
    "users:getById",
    { id },
    { headers: await headers() }
  )
}

// Pattern 2: Mutate + revalidate — server handles cache busting
export async function updateUser(data: { id: number; name: string }) {
  await directRequest("myApi")(
    "users:update",
    data,
    { headers: await headers() }
  )

  revalidatePath("/users")
  // No return needed — the revalidated page re-fetches automatically
}

// Pattern 3: Mutate + return + revalidate — useful for optimistic UI
export async function createUser(data: { name: string; email: string }) {
  const user = await directRequest("myApi")(
    "users:create",
    data,
    { headers: await headers() }
  )

  revalidatePath("/users")
  return user // Return for immediate use before revalidation completes
}`

export default async function ServerActionsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Server Actions"
        description="Use createDirectRequest inside Server Actions for type-safe mutations with automatic revalidation."
      />

      <Prose>
        <h2 id="pattern">The Server Action pattern</h2>

        <p>
          Server Actions are async functions marked with{" "}
          <InlineCode>&quot;use server&quot;</InlineCode> that run on the server when called from
          client components. Combined with <InlineCode>createDirectRequest</InlineCode>, they give
          you type-safe mutations without writing API routes:
        </p>
      </Prose>

      <CodeBlock code={basicActionCode} filename="app/actions/users.ts" />

      <Callout variant="info" title="Always forward headers">
        <p>
          Server Actions receive the browser&apos;s request context, but{" "}
          <InlineCode>directRequest</InlineCode> does not have automatic access to it. Always pass{" "}
          <InlineCode>{"{ headers: await headers() }"}</InlineCode> as the context argument so
          authentication cookies reach your backend.
        </p>
      </Callout>

      <Prose>
        <h2 id="revalidation">Revalidation after mutations</h2>

        <h3 id="revalidate-path">revalidatePath</h3>

        <p>
          Use <InlineCode>revalidatePath</InlineCode> to invalidate cached data for specific pages
          after a mutation. This causes Next.js to re-render the affected pages with fresh data:
        </p>
      </Prose>

      <CodeBlock code={revalidatePathCode} filename="app/actions/users.ts" />

      <Prose>
        <h3 id="revalidate-tag">revalidateTag</h3>

        <p>
          For more granular control, use <InlineCode>revalidateTag</InlineCode> to invalidate all
          cached data associated with a specific tag:
        </p>
      </Prose>

      <CodeBlock code={revalidateTagCode} filename="app/actions/posts.ts" />

      <Prose>
        <h2 id="error-handling">Error handling</h2>

        <p>
          Server Actions should not throw errors to the client — instead, return a result object
          that the client can inspect. Wrap the direct request call in a try/catch and return a
          discriminated union:
        </p>
      </Prose>

      <CodeBlock code={errorHandlingCode} filename="app/actions/users.ts" />

      <Callout variant="warning" title="Don't throw in Server Actions">
        <p>
          If a Server Action throws, Next.js shows the nearest <InlineCode>error.tsx</InlineCode>{" "}
          boundary. For form validation errors or expected API failures, return a result object
          instead so the UI can display a user-friendly message.
        </p>
      </Callout>

      <Prose>
        <h2 id="form-usage">Using with forms</h2>

        <p>
          Call your Server Actions from client components using React&apos;s{" "}
          <InlineCode>useActionState</InlineCode> hook for built-in pending state and progressive
          enhancement:
        </p>
      </Prose>

      <CodeBlock code={formUsageCode} filename="app/users/create-form.tsx" />

      <Prose>
        <h2 id="return-vs-revalidate">Returning data vs revalidation</h2>

        <p>
          There are three patterns for handling the response from a mutation. Choose based on
          whether your UI needs the response data immediately:
        </p>
      </Prose>

      <CodeBlock code={returnVsRevalidateCode} filename="app/actions/users.ts" />

      <Prose>
        <h2 id="vs-use-mutation">Server Actions vs useMutation</h2>

        <p>
          Both Server Actions and React Query&apos;s <InlineCode>useMutation</InlineCode> can handle
          mutations. They serve different use cases:
        </p>

        <ul>
          <li>
            <strong>Server Actions</strong> — best for form submissions, progressive enhancement,
            and when you want Next.js to handle revalidation
          </li>
          <li>
            <strong>useMutation</strong> — best for optimistic updates, cache invalidation via query
            keys, and when you need React Query&apos;s retry/rollback features
          </li>
        </ul>

        <p>
          You can combine both: call a Server Action from <InlineCode>useMutation</InlineCode> to
          get the best of both worlds — server-side execution with client-side cache management.
        </p>
      </Prose>

      <CodeBlock code={mutationCode} filename="app/users/create-button.tsx" />

      <Callout variant="tip" title="Combine for optimistic updates">
        <p>
          Use React Query&apos;s <InlineCode>useMutation</InlineCode> with{" "}
          <InlineCode>onMutate</InlineCode> for optimistic UI, while the actual request goes through
          the proxy route. The proxy mode handles serialization and cookie forwarding automatically.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/server-side/direct">createDirectRequest</Link> — full API reference
            with defaults and raw data mode
          </li>
          <li>
            <Link href="/docs/react-query/use-mutation">useMutation</Link> — React Query mutations
            with proxy mode
          </li>
          <li>
            <Link href="/docs/core-concepts/error-handling">Error Handling</Link> — HTTPError
            structure and error callbacks
          </li>
        </ul>
      </Prose>
    </div>
  )
}
