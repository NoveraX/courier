import { createCaller, registerRequestContext } from "@noverax/courier"
import { nextRequestContext } from "@noverax/courier-next"
import { api } from "@/api"
import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"
import { ServerAnswer } from "@/site/sandbox/server-answer"
import { answerOf } from "@/site/sandbox/server-call"

/* The page's calls carry the request it is rendered for — the visitor's session and address — as
   any server code a framework serves does, so they read the visitor's own data and take from the
   visitor's budget like their calls through the proxy route. */
registerRequestContext(nextRequestContext)
const caller = createCaller(api)

const setupCode = `// Direct mode — import source and create caller inline
import { createCaller } from "@noverax/courier"
import { api } from "@/api"

const caller = createCaller(api)`

const fetchAllCode = `// Server Component — runs on the server, zero client JS
const users = await caller.users.getAll()`

const fetchOneCode = `// Path params are passed as the variables object
const user = await caller.users.getById({ id: 1 })`

const fetchPostsCode = `// Access any request group via dot-notation
const posts = await caller.posts.getAll()`

export const metadata = exampleMetadata("direct")

export default async function DirectExamplesPage() {
  const users = await answerOf(caller.users.getAll())
  const user = await answerOf(caller.users.getById({ id: 1 }))
  const posts = await answerOf(caller.posts.getAll())

  return (
    <ExamplePage name="direct">
      <ExampleSection
        title="Setup"
        description="createCaller uses the same source definitions as proxy mode. One line to set up."
        code={setupCode}
        learnMore={{ href: "/docs/server-side/caller", label: "Direct mode docs" }}
      >
        <p className="m-0 text-body text-fg-muted">
          Direct mode calls the backend from the server itself. There is no{" "}
          <code>/api/request</code> proxy hop: requests go straight to the base URL the source
          declares.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Fetch Users (RSC)"
        description="Data is fetched during server rendering. The response is streamed as HTML — zero client-side fetch."
        code={fetchAllCode}
      >
        <ServerAnswer label="caller.users.getAll()" answer={users} />
      </ExampleSection>

      <ExampleSection
        title="Single User"
        description="Path parameters like :id are replaced automatically from the variables object."
        code={fetchOneCode}
      >
        <ServerAnswer label="caller.users.getById({ id: 1 })" answer={user} />
      </ExampleSection>

      <ExampleSection
        title="Fetch Posts"
        description="Access any request group the same way. The API surface is identical to proxy mode."
        code={fetchPostsCode}
      >
        <ServerAnswer label="caller.posts.getAll()" answer={posts} />
      </ExampleSection>
    </ExamplePage>
  )
}
