"use client"

import { DemoCard } from "@/components/demo-card"
import { ResponseViewer } from "@/components/response-viewer"
import { useQuery } from "@/lib/request"

const definitionCode = `import { Request, RequestGroup, type Method } from "@noverax/nexus/RequestClass";

// Each RequestGroup has a prefix that maps to a backend path
class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" }); // → /users/*
  }

  getAll: Method<UsersListResponse> = ({ get }) => get();       // GET /users
  getById: Method<User, { id: number }> = ({ get }) => get(":id"); // GET /users/:id
  create: Method<User, CreateBody> = ({ post }) => post();      // POST /users
}

class Posts extends RequestGroup {
  constructor() {
    super({ prefix: "posts" }); // → /posts/*
  }

  getAll: Method<PostsListResponse> = ({ get }) => get();       // GET /posts
  create: Method<Post, CreateBody> = ({ post }) => post();      // POST /posts
}

// Groups are registered in the Request class
class MockApi extends Request<typeof groups> {
  constructor() {
    super({ baseURL: "http://localhost:4000", groups });
  }
}`

const usageCode = `import { useQuery } from "@/lib/request";

// "group:method" syntax — group name is the key in groups object
const users = useQuery("mockApi", "users:getAll", { variables: {} });
const posts = useQuery("mockApi", "posts:getAll", { variables: {} });
const user  = useQuery("mockApi", "users:getById", { variables: { id: 1 } });

// The prefix is prepended automatically:
//   users:getAll  → GET  /users
//   posts:getAll  → GET  /posts
//   users:getById → GET  /users/1`

export default function GroupsPage() {
  const users = useQuery("mockApi", "users:getAll", { variables: {} })
  const posts = useQuery("mockApi", "posts:getAll", { variables: {} })
  const singleUser = useQuery("mockApi", "users:getById", { variables: { id: 1 } })

  const isLoading = users.isLoading || posts.isLoading || singleUser.isLoading

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Request Groups</h1>
        <p className="text-muted-foreground mt-1">
          Organize methods into groups with prefixes using RequestGroup.
        </p>
      </div>

      <DemoCard
        title="Group Definition"
        description="Each RequestGroup has a prefix that maps to a backend path segment."
        code={definitionCode}
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border p-3">
            <p className="font-medium">Users group</p>
            <p className="text-muted-foreground">
              prefix: <code>"users"</code> → all methods hit <code>/users/*</code>
            </p>
            <p className="text-muted-foreground mt-1">
              Methods: getAll, getById, create, update, patch, remove
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="font-medium">Posts group</p>
            <p className="text-muted-foreground">
              prefix: <code>"posts"</code> → all methods hit <code>/posts/*</code>
            </p>
            <p className="text-muted-foreground mt-1">Methods: getAll, getById, create</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="font-medium">Misc group</p>
            <p className="text-muted-foreground">
              prefix: <code>none</code> → methods hit root paths directly
            </p>
            <p className="text-muted-foreground mt-1">Methods: stream, slow, error</p>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        title="group:method Syntax"
        description="Use 'group:method' to call methods from different groups on the same source."
        code={usageCode}
      >
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">users:getAll</p>
          {users.data ? <ResponseViewer data={users.data} status={200} /> : null}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">posts:getAll</p>
          {posts.data ? <ResponseViewer data={posts.data} status={200} /> : null}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">users:getById (id: 1)</p>
          {singleUser.data ? <ResponseViewer data={singleUser.data} status={200} /> : null}
        </div>
      </DemoCard>
    </div>
  )
}
