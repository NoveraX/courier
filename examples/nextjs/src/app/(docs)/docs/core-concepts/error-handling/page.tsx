import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const httpErrorCode = `import { HTTPError } from "@noverax/nexus/error"

// HTTPError extends the native Error class
class HTTPError<R = unknown> extends Error {
  status: number    // HTTP status code (400, 404, 500, ...)
  headers: Headers  // Response headers
  data: R           // Parsed response body — typed with the R generic
}

// The error message is automatically set to "HTTP {status}"
// error.message → "HTTP 404"
// error.name → "HTTPError"`

const isHTTPErrorCode = `import { isHTTPError } from "@noverax/nexus/error"

try {
  const user = await directRequest("api")("users:getById", { id: 999 })
} catch (error) {
  // Type guard narrows error to HTTPError
  if (isHTTPError(error)) {
    console.log(error.status)  // 404
    console.log(error.data)    // whatever the backend returned
  }

  // With a typed error body
  if (isHTTPError<{ message: string; code: string }>(error)) {
    console.log(error.data.message) // "User not found"
    console.log(error.data.code)    // "USER_NOT_FOUND"
  }
}`

const tryCatchCode = `import { isHTTPError } from "@noverax/nexus/error"

// Direct mode — try/catch
export default async function UserPage({ params }: { params: { id: string } }) {
  try {
    const user = await directRequest("api")("users:getById", {
      id: Number(params.id),
    })

    return <UserProfile user={user} />
  } catch (error) {
    if (isHTTPError(error)) {
      if (error.status === 404) {
        return <NotFound message="User not found" />
      }
      return <ErrorPage status={error.status} />
    }
    throw error // Re-throw unexpected errors for error boundary
  }
}`

const reactQueryErrorCode = `"use client"

import { isHTTPError } from "@noverax/nexus/error"
import { useQuery, useMutation } from "@/lib/request"

export function UsersList() {
  const { data, error, isError } = useQuery("api", "users:getAll")

  // React Query catches errors automatically
  if (isError && isHTTPError(error)) {
    return <div>Error {error.status}: Failed to load users</div>
  }

  return <ul>{data?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>
}

export function CreateUserForm() {
  const { mutate, error, isError } = useMutation("api", "users:create", {
    onError: (error) => {
      // Handle error in the mutation callback
      if (isHTTPError<{ message: string }>(error)) {
        toast.error(error.data.message)
      }
    },
  })

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      mutate({ name: "Jane", email: "jane@test.com" })
    }}>
      {isError && isHTTPError(error) && (
        <p className="text-red-500">Error: {error.status}</p>
      )}
      <button type="submit">Create User</button>
    </form>
  )
}`

const onErrorHookCode = `import { Request } from "@noverax/nexus/RequestClass"

const groups = { users: new Users(), posts: new Posts() }

class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,

      // Global error hook — runs for every failed request
      onError: async (info, error) => {
        // Log to your error tracking service
        console.error(
          \`[\${info.source}] \${info.group}:\${info.query} failed with \${error.status}\`,
          { variables: info.variables, data: error.data }
        )

        // Handle 401 globally
        if (error.status === 401) {
          // Redirect to login, refresh token, etc.
        }
      },
    })
  }
}`

const errorTypesCode = `// 1. HTTP errors (status >= 400) — most common
// The backend returned an error response with a body
if (isHTTPError(error)) {
  error.status   // 400, 401, 403, 404, 500, ...
  error.data     // Parsed response body (JSON or text)
  error.headers  // Response headers
}

// 2. Network errors — no response received
// Thrown as standard Error (not HTTPError)
// error.message → "Failed to fetch" or similar

// 3. Abort errors — request was cancelled
// Thrown as HTTPError with status 499
if (isHTTPError(error) && error.status === 499) {
  // Request was aborted (by requestAbort or manual AbortController)
}

// 4. JSON parse errors — response is not valid JSON
// Thrown when responseType is "json" but the body cannot be parsed`

export default async function ErrorHandlingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Error Handling"
        description="Handle HTTP errors with typed error data, type guards, and global error hooks."
      />

      <Prose>
        <h2 id="http-error">The HTTPError Class</h2>

        <p>
          When a request fails with an HTTP error status (400 or above), Nexus throws an{" "}
          <InlineCode>HTTPError</InlineCode>. This class extends the native{" "}
          <InlineCode>Error</InlineCode> and adds <InlineCode>status</InlineCode>,{" "}
          <InlineCode>headers</InlineCode>, and a typed <InlineCode>data</InlineCode> property
          containing the parsed response body:
        </p>
      </Prose>

      <CodeBlock code={httpErrorCode} language="typescript" />

      <Callout variant="info" title="Typed error data">
        <p>
          The <InlineCode>{"HTTPError<R>"}</InlineCode> generic lets you type the error response
          body. If your backend returns{" "}
          <InlineCode>{'{ "message": "Not found", "code": "NOT_FOUND" }'}</InlineCode>, you can
          access it as <InlineCode>{"error.data.message"}</InlineCode> with full type safety.
        </p>
      </Callout>

      <Prose>
        <h2 id="is-http-error">The isHTTPError Type Guard</h2>

        <p>
          Use <InlineCode>isHTTPError()</InlineCode> to narrow an unknown error to{" "}
          <InlineCode>HTTPError</InlineCode>. It works as a TypeScript type guard, giving you access
          to <InlineCode>status</InlineCode>, <InlineCode>headers</InlineCode>, and{" "}
          <InlineCode>data</InlineCode> inside the if block:
        </p>
      </Prose>

      <CodeBlock code={isHTTPErrorCode} filename="lib/api-helpers.ts" />

      <Prose>
        <h2 id="patterns">Error Handling Patterns</h2>

        <h3 id="try-catch">Direct mode — try/catch</h3>

        <p>
          In Server Components and Server Actions, use standard try/catch to handle errors from{" "}
          <InlineCode>directRequest</InlineCode>:
        </p>
      </Prose>

      <CodeBlock code={tryCatchCode} filename="app/users/[id]/page.tsx" />

      <Prose>
        <h3 id="react-query">Proxy mode — React Query</h3>

        <p>
          When using <InlineCode>useQuery</InlineCode> and <InlineCode>useMutation</InlineCode>,
          React Query catches errors automatically and exposes them via the{" "}
          <InlineCode>error</InlineCode> property:
        </p>
      </Prose>

      <CodeBlock code={reactQueryErrorCode} filename="components/users.tsx" />

      <Prose>
        <h2 id="global-error-hook">Global Error Hook</h2>

        <p>
          For cross-cutting error handling (logging, authentication redirects, toast notifications),
          use the <InlineCode>onError</InlineCode> hook in your <InlineCode>Request</InlineCode>{" "}
          options. This hook runs for every failed request across all groups:
        </p>
      </Prose>

      <CodeBlock code={onErrorHookCode} filename="api/index.ts" />

      <Callout variant="warning" title="onError does not suppress errors">
        <p>
          The <InlineCode>onError</InlineCode> hook is for side effects only (logging, toasts,
          redirects). The error is still thrown after the hook runs, so your try/catch or React
          Query error handling will still receive it.
        </p>
      </Callout>

      <Prose>
        <h2 id="error-types">Error Types</h2>

        <p>Nexus can throw different types of errors depending on the failure mode:</p>
      </Prose>

      <CodeBlock code={errorTypesCode} language="typescript" />

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/core-concepts/instance">Instance & Methods</Link> — how requests are
            executed under the hood
          </li>
          <li>
            <Link href="/docs/core-concepts/type-safety">Type Safety</Link> — how types flow from
            definitions to error handling
          </li>
          <li>
            <Link href="/docs/core-concepts/request">Request & RequestGroup</Link> — where to
            configure global onError hooks
          </li>
        </ul>
      </Prose>
    </div>
  )
}
