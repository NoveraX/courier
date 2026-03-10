import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

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
    <>
      <PageHeader
        title="CRUD Operations"
        description="Full create, read, update, and delete cycle with useMutation and useQuery."
        mode="proxy"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Full CRUD"
          description="Interactive user management with all HTTP methods."
          code={fullCode}
          learnMoreHref="/docs/react-query/use-mutation"
          learnMoreLabel="useMutation docs"
        >
          <CrudDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Individual Operations"
          description="Code snippets for each CRUD method."
          code={operationsCode}
        >
          <OperationsInfo />
        </ExampleBlock>
      </div>
    </>
  )
}
