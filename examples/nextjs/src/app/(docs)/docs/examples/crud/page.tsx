import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { CrudDemo, OperationsInfo } from "./_components"

const fullCode = `import { useQuery, useMutation } from "@/lib/request"

// List
const { data, refetch } = useQuery("mockApi", "users:getAll")

// Create
const create = useMutation("mockApi", "users:create", {
  onSuccess: () => refetch(),
})

// Update (PUT — full replace)
const update = useMutation("mockApi", "users:update", {
  onSuccess: () => refetch(),
})

// Patch (PATCH — partial update)
const patch = useMutation("mockApi", "users:patch", {
  onSuccess: () => refetch(),
})

// Delete
const remove = useMutation("mockApi", "users:remove", {
  onSuccess: () => refetch(),
})`

const operationsCode = `// CREATE
const create = useMutation("mockApi", "users:create", {
  onSuccess: () => refetch(),
})
create.mutate({ name: "New User", email: "new@example.com" })

// UPDATE (PUT)
const update = useMutation("mockApi", "users:update")
update.mutate({
  id: 1,
  name: "Updated Name",
  email: "updated@example.com",
  role: "moderator",
})

// PATCH
const patch = useMutation("mockApi", "users:patch")
patch.mutate({ id: 1, name: "Patched Name" })

// DELETE
const remove = useMutation("mockApi", "users:remove")
remove.mutate({ id: 1 })`

export const metadata = docsMetadata("CRUD Operations", "Full create, read, update, and delete cycle with useMutation and useQuery.")

export default function CrudExamplesPage() {
  return (
    <>
      <PageHeader
        title="CRUD Operations"
        description="Full create, read, update, and delete cycle with useMutation and useQuery."
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
