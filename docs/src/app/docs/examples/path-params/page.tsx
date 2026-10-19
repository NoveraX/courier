import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { MixedParamsDemo, NestedParamsDemo, SimpleParamDemo } from "./_components"

const simpleCode = `// Method definition with :id placeholder
getById: endpoint.get(":id").variables<{ id: number }>().response<User>()

// Usage — :id is replaced with the value from variables
await caller.users.getById({ id: 1 })
// → GET /users/1`

const nestedCode = `// Multiple path params in one URL
getUserPost: endpoint.get(":id/posts/:postId").variables<{ id: number; postId: number }>().response<UserPostResponse>()

// Both :id and :postId are replaced
await caller.users.getUserPost({ id: 1, postId: 2 })
// → GET /users/1/posts/2`

const mixedCode = `// Path params + query params work together
// Variables matching :placeholders go into the URL path
// Remaining variables go as query params

getAll: endpoint.get("").variables<{ page?: number; limit?: number }>().response<UsersListResponse>()

// No path params — all variables become ?query params
await caller.users.getAll({ page: 1, limit: 5 })
// → GET /users?page=1&limit=5`

export const metadata = exampleMetadata("path-params")

export default function PathParamsExamplesPage() {
  return (
    <ExamplePage name="path-params">
      <ExampleSection
        title="Simple :id"
        description="A single path parameter replaced from the variables object."
        code={simpleCode}
        learnMore={{ href: "/docs/advanced/path-params", label: "Path params docs" }}
      >
        <SimpleParamDemo />
      </ExampleSection>

      <ExampleSection
        title="Nested :id/posts/:postId"
        description="Multiple path params in a single URL — all replaced from variables."
        code={nestedCode}
      >
        <NestedParamsDemo />
      </ExampleSection>

      <ExampleSection
        title="Query Params"
        description="Variables that don't match a :placeholder become query parameters."
        code={mixedCode}
      >
        <MixedParamsDemo />
      </ExampleSection>
    </ExamplePage>
  )
}
