import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { GroupInfo, GroupsDemo } from "./_components"

const definitionCode = `import { defineApi, defineGroup, endpoint } from "@noverax/courier/define"

// Each defineGroup has a prefix that maps to a backend path
const users = defineGroup({
  prefix: "users", // → /users/*
  endpoints: {
    getAll: endpoint<UsersListResponse>()((http) => http.get()),          // GET /users
    getById: endpoint<User, { id: number }>()((http) => http.get(":id")), // GET /users/:id
    create: endpoint<User, CreateBody>()((http) => http.post()),          // POST /users
  },
})

const posts = defineGroup({
  prefix: "posts", // → /posts/*
  endpoints: {
    getAll: endpoint<PostsListResponse>()((http) => http.get()),    // GET /posts
    create: endpoint<Post, CreateBody>()((http) => http.post()),    // POST /posts
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
