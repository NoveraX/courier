import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { GroupsDemo, GroupInfo } from "./_components"

const definitionCode = `import { Request, RequestGroup, type Method } from "@noverax/nexus/RequestClass"

// Each RequestGroup has a prefix that maps to a backend path
class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" }) // → /users/*
  }

  getAll: Method<UsersListResponse> = ({ get }) => get()       // GET /users
  getById: Method<User, { id: number }> = ({ get }) => get(":id") // GET /users/:id
  create: Method<User, CreateBody> = ({ post }) => post()      // POST /users
}

class Posts extends RequestGroup {
  constructor() {
    super({ prefix: "posts" }) // → /posts/*
  }

  getAll: Method<PostsListResponse> = ({ get }) => get()       // GET /posts
  create: Method<Post, CreateBody> = ({ post }) => post()      // POST /posts
}

// Groups are registered in the Request class
class MockApi extends Request<typeof groups> {
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

export const metadata = docsMetadata("Request Groups", "Organize methods into groups with prefixes using RequestGroup.")

export default function GroupsExamplesPage() {
  return (
    <>
      <PageHeader
        title="Request Groups"
        description="Organize methods into groups with prefixes using RequestGroup."
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Group Definition"
          description="Each RequestGroup has a prefix that maps to a backend path segment."
          code={definitionCode}
          learnMoreHref="/docs/core-concepts/request"
          learnMoreLabel="RequestGroup docs"
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
