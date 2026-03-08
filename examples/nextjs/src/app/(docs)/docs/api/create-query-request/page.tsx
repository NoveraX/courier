import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const signatureCode = `import { createQueryRequest } from "@noverax/nexus/query"

const { useQuery, useMutation, request } = createQueryRequest<Sources>(defaults?)`

const returnTypeCode = `{
  useQuery: <K, Q>(source: K, query: Q, options?) => UseQueryResult<R, Error>
  useMutation: <K, Q>(source: K, query: Q, options?) => UseMutationResult<R, Error, V>
  request: CommonRequest<T>  // same as createClientRequest
}`

const queryOptionsCode = `type NexusQueryOptions<R, V> = WithVariables<V> &
  Omit<UseQueryOptions<R, Error, R, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: MethodsInstanceOptions
  }

// WithVariables makes \`variables\` required when the method expects variables
type WithVariables<V> = [V] extends [undefined]
  ? { variables?: undefined }
  : { variables: V }`

const mutationOptionsCode = `type NexusMutationOptions<R, V> = Omit<
  UseMutationOptions<R, Error, [V] extends [undefined] ? void : V>,
  "mutationFn"
> & {
  requestOptions?: MethodsInstanceOptions
}`

const setupCode = `// lib/query.ts
import { createQueryRequest } from "@noverax/nexus/query"
import type { Sources } from "@/api/sources"

export const { useQuery, useMutation, request } = createQueryRequest<Sources>({
  timeout: 10000,
  credentials: "include",
})`

const useQueryCode = `"use client"

import { useQuery } from "@/lib/query"

export function UserList() {
  const { data, isLoading, error } = useQuery("api", "users:getAll", {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  if (isLoading) return <p>Loading...</p>
  if (error) return <p>Error: {error.message}</p>

  return (
    <ul>
      {data?.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}`

const useQueryVarsCode = `// When the method expects variables, \`variables\` becomes required
const { data } = useQuery("api", "users:getById", {
  variables: { id: "123" },
  enabled: !!id,
})

// TypeScript enforces this — omitting \`variables\` is a compile error
// when the method signature requires them`

const useMutationCode = `"use client"

import { useMutation } from "@/lib/query"
import { useQueryClient } from "@tanstack/react-query"

export function CreateUserForm() {
  const queryClient = useQueryClient()

  const { mutate, isPending } = useMutation("api", "users:create", {
    onSuccess: () => {
      // Invalidate the users list to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ["api", "users:getAll"] })
    },
    onError: (error) => {
      console.error("Failed to create user:", error)
    },
  })

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget)
      mutate({ name: formData.get("name") as string })
    }}>
      <input name="name" required />
      <button disabled={isPending}>
        {isPending ? "Creating..." : "Create User"}
      </button>
    </form>
  )
}`

const queryKeysCode = `// Auto-generated query keys follow this pattern:
// Without variables: [source, query]
// With variables:    [source, query, variables]

// Examples:
// useQuery("api", "users:getAll")       → ["api", "users:getAll"]
// useQuery("api", "users:getById", {
//   variables: { id: "123" }
// })                                     → ["api", "users:getById", { id: "123" }]

// Use these keys for manual invalidation:
queryClient.invalidateQueries({ queryKey: ["api", "users:getAll"] })
queryClient.invalidateQueries({ queryKey: ["api"] }) // invalidate all "api" queries`

const requestOptionsCode = `// Pass per-request options via requestOptions
const { data } = useQuery("api", "users:getAll", {
  requestOptions: {
    timeout: 5000,
    cache: "no-store",
  },
  staleTime: 30_000,
})

const { mutate } = useMutation("api", "files:upload", {
  requestOptions: {
    onUploadProgress: (progress) => {
      setProgress(progress.percent)
    },
  },
})`

const rawRequestCode = `// The \`request\` property is the same CommonRequest returned by createClientRequest
// Use it for imperative calls outside of React hooks
import { request } from "@/lib/query"

async function prefetchUser(id: string) {
  return request("api")("users:getById", { id })
}`

export const metadata = docsMetadata(
  "createQueryRequest",
  "Creates type-safe React Query hooks (useQuery, useMutation) and a request client — all wired to your Nexus sources."
)

export default async function CreateQueryRequestPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="createQueryRequest"
        description="Creates type-safe React Query hooks (useQuery, useMutation) and a request client — all wired to your Nexus sources."
        badge="React Query"
      />

      <Prose>
        <h2 id="import">Import</h2>
      </Prose>

      <CodeBlock
        code={`import { createQueryRequest } from "@noverax/nexus/query"`}
        language="typescript"
      />

      <Callout variant="info" title="Peer dependency">
        <p>
          <InlineCode>createQueryRequest</InlineCode> requires{" "}
          <InlineCode>@tanstack/react-query</InlineCode> as a peer dependency. It also re-exports{" "}
          <InlineCode>QueryClient</InlineCode> and <InlineCode>QueryClientProvider</InlineCode> for
          convenience.
        </p>
      </Callout>

      <Prose>
        <h2 id="signature">Signature</h2>
        <p>
          Accepts the same <InlineCode>ClientRequestDefaults</InlineCode> as{" "}
          <InlineCode>createClientRequest</InlineCode>. Returns an object with two hooks and a raw
          request function.
        </p>
      </Prose>

      <CodeBlock code={signatureCode} language="typescript" />

      <Prose>
        <h2 id="return-type">Return Type</h2>
      </Prose>

      <CodeBlock code={returnTypeCode} language="typescript" />

      <Prose>
        <ul>
          <li>
            <InlineCode>useQuery</InlineCode> — fetches data reactively. Accepts source, query, and
            options with variables.
          </li>
          <li>
            <InlineCode>useMutation</InlineCode> — performs mutations. Variables are passed to{" "}
            <InlineCode>mutate()</InlineCode>.
          </li>
          <li>
            <InlineCode>request</InlineCode> — the underlying <InlineCode>CommonRequest</InlineCode>{" "}
            for imperative use outside hooks.
          </li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="setup">Setup</h2>
      </Prose>

      <CodeBlock code={setupCode} filename="lib/query.ts" />

      <Prose>
        <h2 id="use-query">useQuery</h2>
        <p>
          Wraps <InlineCode>@tanstack/react-query</InlineCode>&apos;s{" "}
          <InlineCode>useQuery</InlineCode>. All standard options (
          <InlineCode>staleTime</InlineCode>, <InlineCode>enabled</InlineCode>,{" "}
          <InlineCode>refetchOnWindowFocus</InlineCode>, etc.) are supported.
        </p>
      </Prose>

      <CodeBlock code={useQueryCode} filename="components/user-list.tsx" />

      <Prose>
        <h3 id="variables">Variables</h3>
        <p>
          When a method expects variables, the <InlineCode>variables</InlineCode> option becomes
          required — enforced by TypeScript at compile time.
        </p>
      </Prose>

      <CodeBlock code={useQueryVarsCode} language="typescript" />

      <Prose>
        <h2 id="use-mutation">useMutation</h2>
        <p>
          Wraps <InlineCode>@tanstack/react-query</InlineCode>&apos;s{" "}
          <InlineCode>useMutation</InlineCode>. Variables are passed to the{" "}
          <InlineCode>mutate</InlineCode> function.
        </p>
      </Prose>

      <CodeBlock code={useMutationCode} filename="components/create-user-form.tsx" />

      <Prose>
        <h2 id="query-keys">Query Keys</h2>
        <p>
          Query keys are automatically generated from the source name, query name, and variables.
          Use them for manual cache invalidation.
        </p>
      </Prose>

      <CodeBlock code={queryKeysCode} language="typescript" />

      <Prose>
        <h2 id="options-types">Options Types</h2>
        <h3 id="nexus-query-options">NexusQueryOptions</h3>
      </Prose>

      <CodeBlock code={queryOptionsCode} language="typescript" />

      <Prose>
        <h3 id="nexus-mutation-options">NexusMutationOptions</h3>
      </Prose>

      <CodeBlock code={mutationOptionsCode} language="typescript" />

      <Prose>
        <h2 id="request-options">Per-Request Options</h2>
        <p>
          Use <InlineCode>requestOptions</InlineCode> to pass{" "}
          <InlineCode>MethodsInstanceOptions</InlineCode> (timeout, cache, upload progress, etc.)
          alongside React Query options.
        </p>
      </Prose>

      <CodeBlock code={requestOptionsCode} language="typescript" />

      <Prose>
        <h2 id="raw-request">Raw Request</h2>
        <p>
          The returned <InlineCode>request</InlineCode> is the same{" "}
          <InlineCode>CommonRequest</InlineCode> from <InlineCode>createClientRequest</InlineCode>.
          Use it for imperative calls, prefetching, or anywhere outside React component lifecycle.
        </p>
      </Prose>

      <CodeBlock code={rawRequestCode} language="typescript" />

      <Prose>
        <h2 id="related">Related</h2>
        <ul>
          <li>
            <Link href="/docs/react-query/setup">React Query Setup</Link> — full setup guide with
            QueryClientProvider
          </li>
          <li>
            <Link href="/docs/react-query/use-query">useQuery Guide</Link> — in-depth usage patterns
          </li>
          <li>
            <Link href="/docs/react-query/use-mutation">useMutation Guide</Link> — mutations with
            optimistic updates
          </li>
          <li>
            <Link href="/docs/api/create-client-request">createClientRequest</Link> — the underlying
            proxy-mode factory
          </li>
        </ul>
      </Prose>
    </div>
  )
}
