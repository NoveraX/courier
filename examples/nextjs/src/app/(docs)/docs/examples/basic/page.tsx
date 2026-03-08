import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { GetDemo, ManualDemo, PostDemo } from "./_components"

const getCode = `import { useQuery } from "@/lib/request"

// useQuery fetches data automatically on mount
const { data, isLoading, error } = useQuery("mockApi", "users:getAll", {
  variables: {},
})`

const postCode = `import { useMutation } from "@/lib/request"

const { mutate, data, isPending } = useMutation("mockApi", "users:create")

mutate({ name: "Jane Doe", email: "jane@example.com", role: "user" })`

const manualCode = `import { useMutation } from "@/lib/request"

// useMutation for on-demand calls — no need for manual useState
const { mutate, data, isPending } = useMutation("mockApi", "users:getById")

mutate({ id: 1 })`

export const metadata = docsMetadata(
  "Basic Requests",
  "Simple GET and POST requests using the proxy mode with React Query hooks."
)

export default function BasicExamplesPage() {
  return (
    <>
      <PageHeader
        title="Basic Requests"
        description="Simple GET and POST requests using the proxy mode with React Query hooks."
      />

      <div className="space-y-8">
        <ExampleBlock
          title="GET — Fetch Users"
          description="useQuery auto-fetches on mount. Data is cached and refetched by react-query."
          code={getCode}
          learnMoreHref="/docs/react-query/use-query"
          learnMoreLabel="useQuery docs"
        >
          <GetDemo />
        </ExampleBlock>

        <ExampleBlock
          title="POST — Create User"
          description="useMutation sends data on demand. Click Run to create a new user."
          code={postCode}
          learnMoreHref="/docs/react-query/use-mutation"
          learnMoreLabel="useMutation docs"
        >
          <PostDemo />
        </ExampleBlock>

        <ExampleBlock
          title="On-Demand — Imperative Fetch"
          description="useMutation works for any on-demand call, not just POST. Click to fetch user #1."
          code={manualCode}
        >
          <ManualDemo />
        </ExampleBlock>
      </div>
    </>
  )
}
