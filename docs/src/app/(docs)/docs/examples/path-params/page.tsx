import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { MixedParamsDemo, NestedParamsDemo, SimpleParamDemo } from "./_components"

const simpleCode = `// Method definition with :id placeholder
getById: endpoint<User, { id: number }>()((http) => http.get(":id"))

// Usage — :id is replaced with the value from variables
await caller.users.getById({ id: 1 })
// → GET /users/1`

const nestedCode = `// Multiple path params in one URL
getUserPost: endpoint<UserPostResponse, { id: number; postId: number }>()(
  (http) => http.get(":id/posts/:postId")
)

// Both :id and :postId are replaced
await caller.users.getUserPost({ id: 1, postId: 2 })
// → GET /users/1/posts/2`

const mixedCode = `// Path params + query params work together
// Variables matching :placeholders go into the URL path
// Remaining variables go as query params

getAll: endpoint<UsersListResponse, { page?: number; limit?: number }>()(
  (http) => http.get()
)

// No path params — all variables become ?query params
await caller.users.getAll({ page: 1, limit: 5 })
// → GET /users?page=1&limit=5`

export const metadata = docsMetadata(
  "Path Parameters",
  "Dynamic URL segments with :param placeholders, auto-replaced from variables."
)

export default function PathParamsExamplesPage() {
  return (
    <>
      <PageHeader
        title="Path Parameters"
        description="Dynamic URL segments with :param placeholders, auto-replaced from variables."
        mode="both"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Simple :id"
          description="A single path parameter replaced from the variables object."
          code={simpleCode}
          learnMoreHref="/docs/advanced/path-params"
          learnMoreLabel="Path params docs"
        >
          <SimpleParamDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Nested :id/posts/:postId"
          description="Multiple path params in a single URL — all replaced from variables."
          code={nestedCode}
        >
          <NestedParamsDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Query Params"
          description="Variables that don't match a :placeholder become query parameters."
          code={mixedCode}
        >
          <MixedParamsDemo />
        </ExampleBlock>
      </div>
    </>
  )
}
