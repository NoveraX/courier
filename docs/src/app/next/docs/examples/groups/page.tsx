import { docsMetadata } from "@/lib/metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { GroupInfo, GroupsDemo } from "./_components"

const definitionCode = `import { courier, defineApi, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

// Each defineGroup has a prefix that maps to a backend path
const users = defineGroup({
  prefix: "users", // → /users/*
  endpoints: {
    getAll: endpoint.get("").response<UsersListResponse>(),          // GET /users
    getById: endpoint.get(":id").variables<{ id: number }>().response<User>(), // GET /users/:id
    create: endpoint.post("").variables<CreateBody>().response<User>(),          // POST /users
  },
})

const posts = defineGroup({
  prefix: "posts", // → /posts/*
  endpoints: {
    getAll: endpoint.get("").response<PostsListResponse>(),    // GET /posts
    create: endpoint.post("").variables<CreateBody>().response<Post>(),    // POST /posts
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
    <ExamplePage
      href="/docs/examples/groups"
      title="Request Groups"
      description="Organize endpoints into groups with prefixes using defineGroup."
      mode="both"
    >
      <ExampleSection
        title="Group Definition"
        description="Each group has a prefix that goes in front of every path it calls."
        code={definitionCode}
        learnMore={{ href: "/docs/core-concepts/request", label: "defineGroup docs" }}
      >
        <GroupInfo />
      </ExampleSection>
      <ExampleSection
        title="Calling Across Groups"
        description="Each group is a property of the client — q.users, q.posts — and every call of a group goes under its prefix."
        code={usageCode}
      >
        <GroupsDemo />
      </ExampleSection>
    </ExamplePage>
  )
}
