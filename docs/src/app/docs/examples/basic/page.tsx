import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { GetDemo, ManualDemo, PostDemo } from "./_components"

// side="page"
const getCode = `import { q } from "@/lib/query"

// useQuery fetches on mount, and caches what it fetched
const { data, isLoading, error } = q.users.useQuery("getAll")`

// side="page"
const postCode = `import { keys, q } from "@/lib/query"

// invalidate: the list above is fetched again once the user is created
const { mutate, data, isPending } = q.users.useMutation("create", {
  invalidate: [keys("users", "getAll")],
})

mutate({ name: "Jane Doe", email: "jane@example.com", role: "user" })`

// side="page"
const manualCode = `import { q } from "@/lib/query"

// enabled: false holds the query until refetch() runs it
const { data, isFetching, refetch } = q.users.useQuery("getById", {
  variables: { id: 1 },
  enabled: false,
})

refetch()`

export const metadata = exampleMetadata("basic")

export default function BasicExamplesPage() {
  return (
    <ExamplePage name="basic">
      <ExampleSection
        title="GET — Fetch Users"
        description="useQuery fetches when the component mounts. What it fetched is cached and fetched again when it goes stale."
        code={getCode}
        learnMore={{ href: "/docs/react-query/use-query", label: "useQuery docs" }}
      >
        <GetDemo />
      </ExampleSection>
      <ExampleSection
        title="POST — Create User"
        description="useMutation sends on demand. Run it to create a user: once it is created, the list above is fetched again and holds it."
        code={postCode}
        learnMore={{ href: "/docs/react-query/use-mutation", label: "useMutation docs" }}
      >
        <PostDemo />
      </ExampleSection>
      <ExampleSection
        title="On Demand — Imperative Fetch"
        description="A query that waits: enabled: false holds it until refetch() runs it — here, when you run it."
        code={manualCode}
      >
        <ManualDemo />
      </ExampleSection>
    </ExamplePage>
  )
}
