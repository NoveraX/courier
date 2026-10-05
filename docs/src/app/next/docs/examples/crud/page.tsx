import { docsMetadata } from "@/lib/metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { CrudDemo, OperationsInfo } from "./_components"

const fullCode = `import { q } from "@/lib/query"

// List
const { data, refetch } = q.users.useQuery("getAll")

// Create
const create = q.users.useMutation("create", {
  onSuccess: () => refetch(),
})

// Update (PUT — full replace)
const update = q.users.useMutation("update", {
  onSuccess: () => refetch(),
})

// Patch (PATCH — partial update)
const patch = q.users.useMutation("patch", {
  onSuccess: () => refetch(),
})

// Delete
const remove = q.users.useMutation("remove", {
  onSuccess: () => refetch(),
})`

const operationsCode = `// CREATE
const create = q.users.useMutation("create", {
  onSuccess: () => refetch(),
})
create.mutate({ name: "New User", email: "new@example.com" })

// UPDATE (PUT)
const update = q.users.useMutation("update")
update.mutate({
  id: 1,
  name: "Updated Name",
  email: "updated@example.com",
  role: "moderator",
})

// PATCH
const patch = q.users.useMutation("patch")
patch.mutate({ id: 1, name: "Patched Name" })

// DELETE
const remove = q.users.useMutation("remove")
remove.mutate({ id: 1 })`

export const metadata = docsMetadata(
  "CRUD Operations",
  "Full create, read, update, and delete cycle with useMutation and useQuery."
)

export default function CrudExamplesPage() {
  return (
    <ExamplePage
      href="/docs/examples/crud"
      title="CRUD Operations"
      description="Full create, read, update, and delete cycle with useMutation and useQuery."
      mode="proxy"
    >
      <ExampleSection
        title="Full CRUD"
        description="Manage the users of the docs backend with every HTTP method: create one, pick one to update or patch, or delete one."
        code={fullCode}
        learnMore={{ href: "/docs/react-query/use-mutation", label: "useMutation docs" }}
      >
        <CrudDemo />
      </ExampleSection>
      <ExampleSection
        title="Individual Operations"
        description="Each operation on its own, and the endpoint it calls."
        code={operationsCode}
      >
        <OperationsInfo />
      </ExampleSection>
    </ExamplePage>
  )
}
