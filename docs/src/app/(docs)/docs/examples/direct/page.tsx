import { ExampleBlock } from "@/components/docs/example-block"
import { ResponseViewer } from "@/components/docs/response-viewer"
import { PageHeader } from "@/components/layout/page-header"
import { call } from "@/lib/caller"
import { docsMetadata } from "@/lib/metadata"

const setupCode = `// lib/caller.ts
import { createCaller } from "@noverax/nexus"
import { sources } from "@/api"

export const call = createCaller(sources)`

const fetchAllCode = `import { call } from "@/lib/caller"

// Server Component — runs on the server, zero client JS
const users = await call("api")("users:getAll", {})`

const fetchOneCode = `// Path params work identically to proxy mode
const user = await call("api")("users:getById", { id: 1 })`

const fetchPostsCode = `// Access any request group — same API as proxy mode
const posts = await call("api")("posts:getAll", {})`

export const metadata = docsMetadata(
  "Direct Mode",
  "Server Components fetch data directly from the backend — no proxy, no API route, no client JS."
)

export default async function DirectExamplesPage() {
  const users = await call("api")("users:getAll", {})
  const user = await call("api")("users:getById", { id: 1 })
  const posts = await call("api")("posts:getAll", {})

  return (
    <>
      <PageHeader
        title="Direct Mode"
        description="Server Components fetch data directly from the backend — no proxy, no API route, no client JS."
        mode="direct"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Setup"
          description="createCaller uses the same source definitions as proxy mode. One line to set up."
          code={setupCode}
          learnMoreHref="/docs/server-side/caller"
          learnMoreLabel="Direct mode docs"
        >
          <p className="text-sm text-muted-foreground">
            Direct mode calls the backend directly from the server. No{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/request</code> proxy hop —
            requests go straight to the backend URL defined in your defineApi call.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Fetch Users (RSC)"
          description="Data is fetched during server rendering. The response is streamed as HTML — zero client-side fetch."
          code={fetchAllCode}
        >
          <ResponseViewer data={users} status={200} />
        </ExampleBlock>

        <ExampleBlock
          title="Single User"
          description="Path parameters like :id are replaced automatically from the variables object."
          code={fetchOneCode}
        >
          <ResponseViewer data={user} status={200} />
        </ExampleBlock>

        <ExampleBlock
          title="Fetch Posts"
          description="Access any request group the same way. The API surface is identical to proxy mode."
          code={fetchPostsCode}
        >
          <ResponseViewer data={posts} status={200} />
        </ExampleBlock>
      </div>
    </>
  )
}
