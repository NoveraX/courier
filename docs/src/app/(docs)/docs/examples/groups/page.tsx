import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { GroupInfo, GroupsDemo } from "./_components"

const definitionCode = `import { courier, defineApi, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

// Each defineGroup has a prefix that maps to a backend path
const users = defineGroup({
  prefix: "users", // → /users/*
  endpoints: {
    getAll: endpoint.response<UsersListResponse>().get(""),          // GET /users
    getById: endpoint
      .variables<{ id: number }>()
      .response<User>()
      .get(":id"), // GET /users/:id
    create: endpoint
      .variables<CreateBody>()
      .response<User>()
      .post(""),          // POST /users
  },
})

const posts = defineGroup({
  prefix: "posts", // → /posts/*
  endpoints: {
    getAll: endpoint.response<PostsListResponse>().get(""),    // GET /posts
    create: endpoint
      .variables<CreateBody>()
      .response<Post>()
      .post(""),    // POST /posts
  },
})

// Groups are registered in defineApi
const api = defineApi({
  baseURL: "http://localhost:4000",
  groups: { users, posts },
})`

const usageCode = `import { q } from "@/lib/query"

// Dot-notation — group name maps to the key in defineApi groups
const users = q.users.useQuery("getAll")
const posts = q.posts.useQuery("getAll")
const user  = q.users.useQuery("getById", { variables: { id: 1 } })

// The prefix is prepended automatically:
//   users:getAll  → GET  /users
//   posts:getAll  → GET  /posts
//   users:getById → GET  /users/1`

export const metadata = docsMetadata(
  "Request Groups",
  "Organize endpoints into groups with prefixes using defineGroup."
)

export default function GroupsExamplesPage() {
  return (
    <>
      <PageHeader
        title="Request Groups"
        description="Organize endpoints into groups with prefixes using defineGroup."
        mode="both"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Group Definition"
          description="Each defineGroup has a prefix that maps to a backend path segment."
          code={definitionCode}
          learnMoreHref="/docs/core-concepts/request"
          learnMoreLabel="defineGroup docs"
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
