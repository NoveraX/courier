import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { GroupInfo, GroupsDemo } from "./_components"

const definitionCode = `import { Datasource, EndpointGroup, type Endpoint } from "@noverax/nexus/datasource"

// Each EndpointGroup has a prefix that maps to a backend path
class Users extends EndpointGroup {
  constructor() {
    super({ prefix: "users" }) // → /users/*
  }

  getAll: Endpoint<UsersListResponse> = ({ get }) => get()       // GET /users
  getById: Endpoint<User, { id: number }> = ({ get }) => get(":id") // GET /users/:id
  create: Endpoint<User, CreateBody> = ({ post }) => post()      // POST /users
}

class Posts extends EndpointGroup {
  constructor() {
    super({ prefix: "posts" }) // → /posts/*
  }

  getAll: Endpoint<PostsListResponse> = ({ get }) => get()       // GET /posts
  create: Endpoint<Post, CreateBody> = ({ post }) => post()      // POST /posts
}

// Groups are registered in the Datasource class
class MockApi extends Datasource<typeof groups> {
  constructor() {
    super({ baseURL: "http://localhost:4000", groups })
  }
}`

const usageCode = `import { useQuery } from "@/lib/request"

// "group:method" syntax — group name is the key in groups object
const users = useQuery("mockApi", "users:getAll", { variables: {} })
const posts = useQuery("mockApi", "posts:getAll", { variables: {} })
const user  = useQuery("mockApi", "users:getById", { variables: { id: 1 } })

// The prefix is prepended automatically:
//   users:getAll  → GET  /users
//   posts:getAll  → GET  /posts
//   users:getById → GET  /users/1`

export const metadata = docsMetadata(
  "Request Groups",
  "Organize methods into groups with prefixes using EndpointGroup."
)

export default function GroupsExamplesPage() {
  return (
    <>
      <PageHeader
        title="Request Groups"
        description="Organize methods into groups with prefixes using EndpointGroup."
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Group Definition"
          description="Each EndpointGroup has a prefix that maps to a backend path segment."
          code={definitionCode}
          learnMoreHref="/docs/core-concepts/request"
          learnMoreLabel="EndpointGroup docs"
        >
          <GroupInfo />
        </ExampleBlock>

        <ExampleBlock
          title="group:method Syntax"
          description="Use 'group:method' to call methods from different groups on the same source."
          code={usageCode}
        >
          <GroupsDemo />
        </ExampleBlock>
      </div>
    </>
  )
}
